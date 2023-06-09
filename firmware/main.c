#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include "nordic_common.h"
#include "nrf.h"
#include "app_error.h"
#include "ble.h"
#include "ble_hci.h"
#include "ble_srv_common.h"
#include "ble_advdata.h"
#include "ble_advertising.h"
#include "ble_conn_params.h"
#include "nrf_sdh.h"
#include "nrf_sdh_soc.h"
#include "nrf_sdh_ble.h"
#include "app_timer.h"

#include "ble_conn_state.h"
#include "nrf_ble_gatt.h"
#include "nrf_ble_qwr.h"
#include "nrf_pwr_mgmt.h"
#include "nrf_drv_saadc.h"
#include "nrf_delay.h"
#include "nrf_drv_rtc.h"

#include "ble_activity.h"

#include "nrf_log.h"
#include "nrf_log_ctrl.h"
#include "nrf_log_default_backends.h"

#include "acc.h"
#include "activity.h"

#define DEVICE_NAME                     "Band"                                    /**< Name of device. Will be included in the advertising data. */
#define MANUFACTURER_NAME               "Band"                                    /**< Manufacturer. Will be passed to Device Information Service. */
#define APP_ADV_INTERVAL                1600                                     /**< The advertising interval (in units of 0.625 ms. This value corresponds to 500 ms). */
#define RADIO_TX_LEVEL                  0                                        /* 0dB */

#define ACTIVITY_SERVICE_UUID_TYPE      BLE_UUID_TYPE_VENDOR_BEGIN              /**< UUID type for the Activity Service (vendor specific). */

#define APP_ADV_DURATION                6000                                    /**< The advertising duration (60 seconds) in units of 10 milliseconds. */
#define APP_BLE_OBSERVER_PRIO           3                                       /**< Application's BLE observer priority.  */
#define APP_BLE_CONN_CFG_TAG            1                                       /**< A tag identifying the SoftDevice BLE configuration. */
           
#define APP_BLE_ADV_BAT_POS             20
#define APP_BLE_ADV_TEMP_POS            14

#define APP_BATTERY_SVC_UUID            0x180f
#define APP_TEMPERATURE_SVC_UUID        0x2a6e

#define MIN_CONN_INTERVAL               MSEC_TO_UNITS(100, UNIT_1_25_MS)        /**< Minimum acceptable connection interval (0.1 seconds). */
#define MAX_CONN_INTERVAL               MSEC_TO_UNITS(200, UNIT_1_25_MS)        /**< Maximum acceptable connection interval (0.2 second). */
#define SLAVE_LATENCY                   0                                       /**< Slave latency. */
#define CONN_SUP_TIMEOUT                MSEC_TO_UNITS(4000, UNIT_10_MS)         /**< Connection supervisory timeout (4 seconds). */

#define FIRST_CONN_PARAMS_UPDATE_DELAY  APP_TIMER_TICKS(5000)                   /**< Time from initiating event (connect or start of notification) to first time sd_ble_gap_conn_param_update is called (5 seconds). */
#define NEXT_CONN_PARAMS_UPDATE_DELAY   APP_TIMER_TICKS(30000)                  /**< Time between each call to sd_ble_gap_conn_param_update after the first call (30 seconds). */
#define MAX_CONN_PARAMS_UPDATE_COUNT    3                                       /**< Number of attempts before giving up the connection parameter negotiation. */

#define DEAD_BEEF                       0xDEADBEEF                              /**< Value used as error code on stack dump, can be used to identify stack location on stack unwind. */

#define ACTIVITY_RECORD_INTERVAL        APP_TIMER_TICKS(1000)                   /** Wake up and read samples; Save activity data every minute */

#define APP_BATTERY_CHECK_TIMEOUT       60                                      /** Measure once an hour **/

#define APP_STATE_FLAG_STANDBY          (0x00)
#define APP_STATE_FLAG_ACTIVE           (0x01)


/********  Device State **********/

volatile uint8_t app_device_state = APP_STATE_FLAG_STANDBY;
volatile int32_t battery_check_timeout = 0;

//current epoch in seconds
volatile uint32_t last_rtc_count = 0;
volatile uint32_t timestamp = 0;
volatile uint32_t last_sample_time = 0;

//state Variables BLE Activity data request
activity_sample_t * activity_rec_ptr;  //points to the next activity record to be transmitted
uint16_t activity_rec_count = 0;       //number of records remaining to transmit

//State variables for device status
volatile float battery = 0;
volatile float temperature = 0;
uint8_t battery_adv_data[1] = {0};
uint8_t temperature_adv_data[2] = {0};
uint8_array_t battery_data_array = { .p_data = battery_adv_data, .size = 1 };
uint8_array_t temperature_data_array = { .p_data = temperature_adv_data, .size = 2 };

static nrf_saadc_value_t adc_buf[2];

BLE_ACTIVITY_DEF(m_activity);
NRF_BLE_GATT_DEF(m_gatt);                                                       /**< GATT module instance. */
NRF_BLE_QWR_DEF(m_qwr);                                                         /**< Context for the Queued Write module.*/
BLE_ADVERTISING_DEF(m_advertising);                                             /**< Advertising module instance. */

APP_TIMER_DEF(m_activity_timer_id);

static uint16_t m_conn_handle = BLE_CONN_HANDLE_INVALID;                        /**< Handle of the current connection. */

static ble_uuid_t m_adv_uuids[] =                                               /**< Universally unique service identifiers. */
{
    {BLE_UUID_DEVICE_INFORMATION_SERVICE, BLE_UUID_TYPE_BLE}
};

static void advertising_start(void);
static void acc_wakeup_evt_handler(void);
static void app_set_active(void);
static void app_set_standby(void);

//Soft Device Assertion Callback 
void assert_nrf_callback(uint16_t line_num, const uint8_t * p_file_name)
{
    app_error_handler(DEAD_BEEF, line_num, p_file_name);
}


/********* Time Functions ***********************************/

//get elapsed time in milliseconds
uint32_t get_elapsed_seconds(uint32_t from, uint32_t to) 
{
    return ROUNDED_DIV(app_timer_cnt_diff_compute(to, from), 16384);
}

void update_current_time(void) 
{
    uint32_t now = app_timer_cnt_get();

    timestamp += get_elapsed_seconds(last_rtc_count, now);
    last_rtc_count = now;
}

uint32_t get_current_time(void) 
{
    update_current_time();

    return timestamp;
}

static void set_time(uint32_t ts) 
{
    timestamp = ts;
    last_rtc_count = app_timer_cnt_get();
    #ifdef DEBUG
    NRF_LOG_DEBUG("Set time to: %u", ts);
    #endif
}

uint8_t get_current_battery(void) 
{
    return battery_level_in_percent(battery * 1000);
}

/*********************  Sensor Data Functions ******************************/

/*** Battery Measurement Functions ***/

static void battery_adc_event_handler(nrf_drv_saadc_evt_t const * p_event)
{
    if (p_event->type != NRF_DRV_SAADC_EVT_DONE)
    {
        return;
    }

    nrf_saadc_value_t adc_result;
    uint16_t batt_lvl_in_milli_volts;
    uint32_t err_code;

    adc_result = p_event->data.done.p_buffer[0];

    err_code = nrf_drv_saadc_buffer_convert(p_event->data.done.p_buffer, 1);
    APP_ERROR_CHECK(err_code);

    nrf_drv_saadc_uninit();

    /*  To calculate the battery voltage in millivolts: 
        Multiply the adc value by the reference voltage in millivolts (600)
        Divide by 10bit max resolution (1024)
        Add forward diode voltage drop in millivolts (270)
    */
    batt_lvl_in_milli_volts = (((adc_result * 600) / 1024) * 6) + 270;
    battery = ((float)batt_lvl_in_milli_volts / 1000);

    //update the battery service value (this doesn't change it.  see below)
    battery_adv_data[0] = battery_level_in_percent(batt_lvl_in_milli_volts);

    //update the advertising memory location directly - this is a hack to change the advertising data without restarting 
    *(m_advertising.adv_data.adv_data.p_data + APP_BLE_ADV_BAT_POS) = battery_adv_data[0];

    NRF_LOG_DEBUG("Battery %1.2dV, %u%, %u", battery, battery_level_in_percent(batt_lvl_in_milli_volts), batt_lvl_in_milli_volts);
}

static void battery_adc_init(void)
{
    ret_code_t err_code = nrf_drv_saadc_init(NULL, battery_adc_event_handler);
    APP_ERROR_CHECK(err_code);

    nrf_saadc_channel_config_t config = NRF_DRV_SAADC_DEFAULT_CHANNEL_CONFIG_SE(NRF_SAADC_INPUT_VDD);
    err_code = nrf_drv_saadc_channel_init(0, &config);
    APP_ERROR_CHECK(err_code);

    
    err_code = nrf_drv_saadc_buffer_convert(&adc_buf[0], 1);
    APP_ERROR_CHECK(err_code);

    err_code = nrf_drv_saadc_buffer_convert(&adc_buf[1], 1);
    APP_ERROR_CHECK(err_code);
    
}

static void measure_battery(void) {
    battery_check_timeout = APP_BATTERY_CHECK_TIMEOUT;
    battery_adc_init();
    nrf_drv_saadc_sample();
}

/*** Temperature Measurement ***/

static void measure_temperature(void) {
    uint32_t temp;
    ret_code_t err_code;

    err_code = sd_temp_get(&temp);
    APP_ERROR_CHECK(err_code);

    //update the advertised values
    uint16_t t16 = (uint16_t)((temp * 100) / 4);
    //update the service data
    memcpy(temperature_adv_data, &t16, 2);

    //update the advertising data directly to bypass having to restart advertising
    memcpy((m_advertising.adv_data.adv_data.p_data + APP_BLE_ADV_TEMP_POS), &t16, 2);

    temperature = (((float)temp / 4) * 1.8) + 32;
}

static ret_code_t save_activity_data(void) 
{
    ret_code_t err_code = NRF_SUCCESS;
    uint8_t intensity = 0;
    uint16_t steps = 0;

    //get the peak intensity, steps and movement flag
    acc_get_activity(&intensity, &steps);

    //update the last sample time
    last_sample_time = timestamp;

    activity_add_sample(timestamp, intensity, steps, (uint8_t)temperature);

    NRF_LOG_DEBUG("Activity Data: %u, %u, %u, %3.2dF, %1.3dV", timestamp, intensity, steps, temperature, battery);

    return err_code;
}

/*********************  Timer Functions ******************************/

//Activity Timer is started once activity tracking has begun (when datetime is first set over bluetooth). 
//It is called every second and updates the timestamp and reads the accelerometer data, updating the averages
//Every 60 seconds it saves activity data to memory and resets the intensity and step values for the next minute
static void save_activity_timer_handler(void * p_context){

    UNUSED_PARAMETER(p_context);

    //check for sleep mode
    if(app_device_state != APP_STATE_FLAG_ACTIVE) {
        return;
    }
    
    //update the clock/timestamp values
    update_current_time();

    //read the accelerometer samples
    acc_read_current_values();

    //save activity data once a minute 
    if((timestamp - last_sample_time) >= 60) {
        save_activity_data();
    }
}

//initializes timers (activity and blink)
static void timers_init(void)
{
    ret_code_t err_code = app_timer_init();
    APP_ERROR_CHECK(err_code);

    err_code = app_timer_create(&m_activity_timer_id,
                                APP_TIMER_MODE_REPEATED,
                                save_activity_timer_handler);
    APP_ERROR_CHECK(err_code);
}


/*********************  BLE Functions ******************************/

//Transmit activity data
static void send_activity_data(uint16_t conn_handle) 
{
    ret_code_t err_code;
    uint8_t tx_buffer[BLE_ACTIVITY_MAX_TX_LENGTH];
    uint16_t i = 0;
    const uint8_t rec_size = sizeof(activity_sample_t);

    if(activity_rec_count == 0) {
        //send 0 to indicate no records available
        memcpy(&tx_buffer[0], &activity_rec_count, 2);
        i += 2;
    } else {

        while(i < (BLE_ACTIVITY_MAX_TX_LENGTH - (rec_size + 2)) && activity_rec_count > 0) {
            //rec counter in first two bytes
            memcpy(&tx_buffer[i], &activity_rec_count, 2);
            i += 2;
            //copy the record
            memcpy(&tx_buffer[i], activity_rec_ptr, rec_size);
            i += rec_size;  

            activity_rec_count--;
            activity_inc_ptr(&activity_rec_ptr);
        }
    }

    #ifdef DEBUG
    NRF_LOG_DEBUG("sending activity data %u %u", activity_rec_count, i);
    NRF_LOG_HEXDUMP_DEBUG(tx_buffer, i);
    #endif

    err_code = ble_activity_data_send(&m_activity, tx_buffer, &i, conn_handle);
    if ((err_code != NRF_SUCCESS) &&
        (err_code != NRF_ERROR_INVALID_STATE) &&
        (err_code != NRF_ERROR_RESOURCES) &&
        (err_code != NRF_ERROR_BUSY) &&
        (err_code != BLE_ERROR_GATTS_SYS_ATTR_MISSING)
        )
    {
        NRF_LOG_DEBUG("error sending record data: %u", err_code);
        NRF_LOG_HEXDUMP_DEBUG(&err_code, 4);
    }
}

// Data Event Handler for the Activity Service.
static void activity_evt_handler(ble_activity_evt_t * p_evt)
{
    uint32_t ts = 0;
    
    NRF_LOG_DEBUG("Received data");
    NRF_LOG_HEXDUMP_DEBUG(p_evt->data, p_evt->len);

     switch (p_evt->type)
    {
        case BLE_ACTIVITY_REQ:
            ts = *((uint32_t *)p_evt->data);
            
            NRF_LOG_DEBUG("Received data request starting from: %u", ts);

            activity_rec_count = activity_get_start_ptr(ts, &activity_rec_ptr);
            send_activity_data(p_evt->conn_handle);

            break;

        case BLE_ACTIVITY_DATA_TX_RDY:
            if(activity_rec_count > 0) {
                send_activity_data(p_evt->conn_handle);
            }

            break;

        case BLE_ACTIVITY_WRITE_DATETIME:
            ts = *((uint32_t *)p_evt->data);
            
            set_time(ts);

            //adjust buffer pointer if set to earlier time
            activity_time_changed(timestamp);

            update_current_time();

            //set device as active
            if(app_device_state != APP_STATE_FLAG_ACTIVE) {
                app_set_active();
            }

            break;

        default:
            break;   
    }
}

//GAP Init
static void gap_params_init(void)
{
    ret_code_t              err_code;
    ble_gap_conn_params_t   gap_conn_params;
    ble_gap_conn_sec_mode_t sec_mode;

    BLE_GAP_CONN_SEC_MODE_SET_OPEN(&sec_mode);

    err_code = sd_ble_gap_device_name_set(&sec_mode,
                                          (const uint8_t *)DEVICE_NAME,
                                          strlen(DEVICE_NAME));
    APP_ERROR_CHECK(err_code);

    memset(&gap_conn_params, 0, sizeof(gap_conn_params));

    gap_conn_params.min_conn_interval = MIN_CONN_INTERVAL;
    gap_conn_params.max_conn_interval = MAX_CONN_INTERVAL;
    gap_conn_params.slave_latency     = SLAVE_LATENCY;
    gap_conn_params.conn_sup_timeout  = CONN_SUP_TIMEOUT;

    err_code = sd_ble_gap_ppcp_set(&gap_conn_params);
    APP_ERROR_CHECK(err_code);
}


/**@brief Function for initializing the GATT module.
 */
static void gatt_init(void)
{
    ret_code_t err_code = nrf_ble_gatt_init(&m_gatt, NULL);
    APP_ERROR_CHECK(err_code);
}

//Queued write error handler
static void nrf_qwr_error_handler(uint32_t nrf_error)
{
    APP_ERROR_HANDLER(nrf_error);
}

//BLE Services Init
static void ble_services_init(void)
{
    ret_code_t         err_code;
    nrf_ble_qwr_init_t qwr_init = {0};
    ble_activity_init_t activity_init;

    // Initialize Queued Write Module.
    qwr_init.error_handler = nrf_qwr_error_handler;
    err_code = nrf_ble_qwr_init(&m_qwr, &qwr_init);
    APP_ERROR_CHECK(err_code);

    // Initialize Activity Service.
    memset(&activity_init, 0, sizeof(activity_init));

    activity_init.evt_handler = activity_evt_handler;
    activity_init.battery = (uint8_t)battery_level_in_percent(battery * 1000);
    activity_init.timestamp = timestamp;

    err_code = ble_activity_init(&m_activity, &activity_init);
    APP_ERROR_CHECK(err_code);
}

//BLE Connection Event Handler
static void on_conn_params_evt(ble_conn_params_evt_t * p_evt)
{
    ret_code_t err_code;

    if (p_evt->evt_type == BLE_CONN_PARAMS_EVT_FAILED)
    {
        err_code = sd_ble_gap_disconnect(m_conn_handle, BLE_HCI_CONN_INTERVAL_UNACCEPTABLE);
        APP_ERROR_CHECK(err_code);
    }
}

//BLE Connection Error Handler
static void conn_params_error_handler(uint32_t nrf_error)
{
    APP_ERROR_HANDLER(nrf_error);
}

//BLE Connection Init
static void conn_params_init(void)
{
    ret_code_t             err_code;
    ble_conn_params_init_t cp_init;

    memset(&cp_init, 0, sizeof(cp_init));

    cp_init.p_conn_params                  = NULL;
    cp_init.first_conn_params_update_delay = FIRST_CONN_PARAMS_UPDATE_DELAY;
    cp_init.next_conn_params_update_delay  = NEXT_CONN_PARAMS_UPDATE_DELAY;
    cp_init.max_conn_params_update_count   = MAX_CONN_PARAMS_UPDATE_COUNT;
    cp_init.start_on_notify_cccd_handle    = BLE_GATT_HANDLE_INVALID;
    cp_init.disconnect_on_fail             = false;
    cp_init.evt_handler                    = on_conn_params_evt;
    cp_init.error_handler                  = conn_params_error_handler;

    err_code = ble_conn_params_init(&cp_init);
    APP_ERROR_CHECK(err_code);
}

//BLE Advertising Event Handler
static void on_adv_evt(ble_adv_evt_t ble_adv_evt)
{
    switch (ble_adv_evt)
    {
        case BLE_ADV_EVT_FAST:
            break;

        case BLE_ADV_EVT_IDLE:
            //This is called every 60 seconds. So we use it as a timer for checking the battery and temperature

            //measure the battery
            battery_check_timeout--;
            if(battery_check_timeout <= 0) {
                measure_battery();
            }

            if(app_device_state == APP_STATE_FLAG_ACTIVE) {
                //update the temperature
                measure_temperature();
            }

            advertising_start();

            break;

        default:
            break;
    }
}

//BLE Event Handler (for connection events)
static void ble_evt_handler(ble_evt_t const * p_ble_evt, void * p_context)
{
    ret_code_t err_code = NRF_SUCCESS;

    switch (p_ble_evt->header.evt_id)
    {
        case BLE_GAP_EVT_DISCONNECTED:
            #ifdef DEBUG            
            NRF_LOG_DEBUG("Disconnected.");
            #endif
            m_conn_handle = BLE_CONN_HANDLE_INVALID;

            //reset activity data record tx counter
            activity_rec_count = 0;

            break;

        case BLE_GAP_EVT_CONNECTED:

            NRF_LOG_DEBUG("Connected.");

            m_conn_handle = p_ble_evt->evt.gap_evt.conn_handle;
            err_code = nrf_ble_qwr_conn_handle_assign(&m_qwr, m_conn_handle);
            APP_ERROR_CHECK(err_code);
            break;

        case BLE_GAP_EVT_PHY_UPDATE_REQUEST:
        {
            ble_gap_phys_t const phys =
            {
                .rx_phys = BLE_GAP_PHY_AUTO,
                .tx_phys = BLE_GAP_PHY_AUTO,
            };
            err_code = sd_ble_gap_phy_update(p_ble_evt->evt.gap_evt.conn_handle, &phys);
            APP_ERROR_CHECK(err_code);
        } break;

        case BLE_GATTC_EVT_TIMEOUT:
            // Disconnect on GATT Client timeout event.
            err_code = sd_ble_gap_disconnect(p_ble_evt->evt.gattc_evt.conn_handle,
                                             BLE_HCI_REMOTE_USER_TERMINATED_CONNECTION);
            APP_ERROR_CHECK(err_code);
            break;

        case BLE_GATTS_EVT_TIMEOUT:
            // Disconnect on GATT Server timeout event.
            err_code = sd_ble_gap_disconnect(p_ble_evt->evt.gatts_evt.conn_handle,
                                             BLE_HCI_REMOTE_USER_TERMINATED_CONNECTION);
            APP_ERROR_CHECK(err_code);
            break;

        default:
            break;
    }
}

//BLE Stack Init
static void ble_stack_init(void)
{
    ret_code_t err_code;

    err_code = nrf_sdh_enable_request();
    APP_ERROR_CHECK(err_code);

    // Configure the BLE stack using the default settings.
    // Fetch the start address of the application RAM.
    uint32_t ram_start = 0;
    err_code = nrf_sdh_ble_default_cfg_set(APP_BLE_CONN_CFG_TAG, &ram_start);
    APP_ERROR_CHECK(err_code);

    // Enable BLE stack.
    err_code = nrf_sdh_ble_enable(&ram_start);
    APP_ERROR_CHECK(err_code);

    // Register a handler for BLE events.
    NRF_SDH_BLE_OBSERVER(m_ble_observer, APP_BLE_OBSERVER_PRIO, ble_evt_handler, NULL);
}

//BLE Advertising Init 
static void advertising_init(void)
{
    ret_code_t             err_code;
    int8_t tx_level = RADIO_TX_LEVEL;
    ble_advertising_init_t init;
    ble_advdata_service_data_t service_data[2];
    

    memset(&service_data, 0, sizeof(service_data));

    service_data[0].service_uuid = APP_TEMPERATURE_SVC_UUID; 
    service_data[0].data = temperature_data_array;
    service_data[1].service_uuid = APP_BATTERY_SVC_UUID; 
    service_data[1].data = battery_data_array;

    memset(&init, 0, sizeof(init));

    init.advdata.name_type               = BLE_ADVDATA_FULL_NAME;
    init.advdata.include_appearance      = false;
    init.advdata.flags                   = BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE;
    init.advdata.uuids_complete.uuid_cnt = sizeof(m_adv_uuids) / sizeof(m_adv_uuids[0]);
    init.advdata.uuids_complete.p_uuids  = m_adv_uuids;
    init.advdata.p_tx_power_level        = &tx_level;
    init.advdata.p_service_data_array    = service_data;
    init.advdata.service_data_count      = 2;

    init.config.ble_adv_fast_enabled  = true;
    init.config.ble_adv_fast_interval = APP_ADV_INTERVAL;
    init.config.ble_adv_fast_timeout  = APP_ADV_DURATION;

    init.evt_handler = on_adv_evt;

    err_code = ble_advertising_init(&m_advertising, &init);
    APP_ERROR_CHECK(err_code);

    ble_advertising_conn_cfg_tag_set(&m_advertising, APP_BLE_CONN_CFG_TAG);

    //set the power level
    err_code = sd_ble_gap_tx_power_set(BLE_GAP_TX_POWER_ROLE_ADV, m_advertising.adv_handle, RADIO_TX_LEVEL);
    APP_ERROR_CHECK(err_code);
}

//BLE Start Advertising
static void advertising_start(void)
{
    ret_code_t err_code = ble_advertising_start(&m_advertising, BLE_ADV_MODE_FAST);
    APP_ERROR_CHECK(err_code);
}

/*********************  Device State Functions ******************************/

static void app_set_standby(void) 
{
    measure_temperature();
    measure_battery();

    advertising_start();

    app_device_state = APP_STATE_FLAG_STANDBY;
}

//set active, start recording activity data, sleep after 3 days of no movement
static void app_set_active(void) 
{
    NRF_LOG_DEBUG("Begin Monitoring Activity");

    app_device_state = APP_STATE_FLAG_ACTIVE;

    last_sample_time = timestamp;

    //start monitoring movement
    acc_start_activity_monitor();

    // Start activity sample timer.
    ret_code_t err_code = app_timer_start(m_activity_timer_id, ACTIVITY_RECORD_INTERVAL, NULL);
    APP_ERROR_CHECK(err_code);
}

//Log init for debug
static void log_init(void)
{
    #ifdef DEBUG
    ret_code_t err_code = NRF_LOG_INIT(NULL);
    APP_ERROR_CHECK(err_code);

    NRF_LOG_DEFAULT_BACKENDS_INIT();
    #endif
}

//Power Management Init
static void power_management_init(void)
{
    ret_code_t err_code;
    err_code = nrf_pwr_mgmt_init();
    APP_ERROR_CHECK(err_code);
}

//Idle State event handler
static void idle_state_handle(void)
{
    #ifdef DEBUG
    if (NRF_LOG_PROCESS() == false)
    {
        nrf_pwr_mgmt_run();
    }
    #else
        nrf_pwr_mgmt_run();
    #endif
}

int main(void)
{  
    //power consumption on idle work around
    //*(volatile uint32_t *)0x4007AC84ul = 0x00000002ul;

    // Initialize.
    log_init();
    timers_init();

    set_time(0); //initialize time variables

    activity_init_buffer();
    acc_init();

    power_management_init();

    NRF_LOG_DEBUG("Starting\r\n");

    ble_stack_init();

    //set the DC to DC buck converter option to on (requires external inductors).
    sd_power_dcdc_mode_set(NRF_POWER_DCDC_ENABLE);

    gap_params_init();
    gatt_init();
    advertising_init();
    ble_services_init();
    conn_params_init();

    app_set_standby();

    for (;;)
    {
        idle_state_handle();
    }
}


/**
 * @}
 */
