#include "sdk_common.h"
#include "ble_activity.h"
#include "ble_conn_state.h"

#include "nrf_log.h"

extern uint32_t get_current_time(void);
extern uint8_t get_current_battery(void);

static void on_connect(ble_activity_t * p_activity, ble_evt_t const * p_ble_evt)
{
    ret_code_t                 err_code;
    ble_gatts_value_t          gatts_val;
    uint32_t ts = get_current_time();
    uint8_t bat = get_current_battery();

    // Initialize value struct.
    memset(&gatts_val, 0, sizeof(gatts_val));

    gatts_val.len     = 4;
    gatts_val.p_value = (uint8_t *)&ts;

    // Update database.
    err_code = sd_ble_gatts_value_set(BLE_CONN_HANDLE_INVALID,
                                      p_activity->activity_datetime_handles.value_handle,
                                      &gatts_val);

    gatts_val.len     = 1;
    gatts_val.p_value = &bat;
    err_code = sd_ble_gatts_value_set(BLE_CONN_HANDLE_INVALID,
                                      p_activity->activity_battery_handles.value_handle,
                                      &gatts_val);
}

static void on_write(ble_activity_t * p_activity, ble_evt_t const * p_ble_evt)
{
    ble_activity_evt_t evt;
    ble_gatts_evt_write_t const * p_evt_write = &p_ble_evt->evt.gatts_evt.params.write;

    memset(&evt, 0, sizeof(ble_activity_evt_t));
    evt.p_activity = p_activity;
    evt.conn_handle = p_ble_evt->evt.gatts_evt.conn_handle;

    for(int i = p_evt_write->len - 1; i >= 0; i--) {
        evt.data[(p_evt_write->len - 1) - i] = p_evt_write->data[i];
    }

    evt.len = p_evt_write->len;


    if ((p_evt_write->handle == p_activity->activity_data_handles.cccd_handle) &&  (p_evt_write->len == 2))
    {
        if (ble_srv_is_notification_enabled(p_evt_write->data))
        {
            evt.type = BLE_ACTIVITY_DATA_NOTIFICATION_ENABLED;
        }
        else
        {
            evt.type = BLE_ACTIVITY_DATA_NOTIFICATION_DISABLED;
        }
    }
    else if (p_evt_write->handle == p_activity->activity_req_handles.value_handle)
    {
        /* Activity Data Request */
        evt.type = BLE_ACTIVITY_REQ;

        p_activity->evt_handler(&evt);
    } else if(p_evt_write->handle == p_activity->activity_datetime_handles.value_handle) {

        /* Datetime update */
        evt.type = BLE_ACTIVITY_WRITE_DATETIME;

        p_activity->evt_handler(&evt);
    } 
}

/**@brief Function for handling the @ref BLE_GATTS_EVT_HVN_TX_COMPLETE event from the SoftDevice. 
 * Activity data has been transmitted - ready to send more
*/
static void on_hvx_tx_complete(ble_activity_t * p_activity, ble_evt_t const * p_ble_evt)
{
    ble_activity_evt_t evt;
    
    ble_gatts_evt_hvc_t const * p_evt_hvc = &(p_ble_evt->evt.gatts_evt.params.hvc);

    memset(&evt, 0, sizeof(ble_activity_evt_t));
    evt.type        = BLE_ACTIVITY_DATA_TX_RDY;
    evt.p_activity  = p_activity;
    evt.conn_handle = p_ble_evt->evt.gatts_evt.conn_handle;

    p_activity->evt_handler(&evt);
}

/* BLE event handler - connect, write, tx complete events */
void ble_activity_on_ble_evt(ble_evt_t const * p_ble_evt, void * p_context)
{
    if ((p_context == NULL) || (p_ble_evt == NULL))
    {
        return;
    }

    ble_activity_t * p_activity = (ble_activity_t *)p_context;

    #ifdef DEBUG
    NRF_LOG_DEBUG("BLE EVENT %u", p_ble_evt->header.evt_id);
    #endif

    switch (p_ble_evt->header.evt_id)
    {
        case BLE_GAP_EVT_CONNECTED:
            on_connect(p_activity, p_ble_evt);
            break;
        case BLE_GATTS_EVT_WRITE:
            on_write(p_activity, p_ble_evt);
            break;
        case BLE_GATTS_EVT_HVN_TX_COMPLETE:
            on_hvx_tx_complete(p_activity, p_ble_evt);
            break;

        default:
            break;
    }
}


/*  Initialize the service and add the characteristics 
*/
uint32_t ble_activity_init(ble_activity_t * p_activity, const ble_activity_init_t * p_activity_init)
{
    ret_code_t              err_code; 
    ble_uuid_t            service_uuid; 
    ble_uuid128_t         activity_base_uuid = ACTIVITY_BASE_UUID;
    ble_add_char_params_t add_char_params; 

    p_activity->evt_handler = p_activity_init->evt_handler;

    err_code = sd_ble_uuid_vs_add(&activity_base_uuid, &p_activity->uuid_type);
    VERIFY_SUCCESS(err_code);

    service_uuid.type = p_activity->uuid_type;
    service_uuid.uuid = BLE_UUID_ACTIVITY_SERVICE;

    err_code = sd_ble_gatts_service_add(BLE_GATTS_SRVC_TYPE_PRIMARY, &service_uuid, &p_activity->service_handle);
    VERIFY_SUCCESS(err_code);

    // Add the REQ Characteristic.
    memset(&add_char_params, 0, sizeof(add_char_params));
    add_char_params.uuid                     = BLE_UUID_ACTIVITY_REQ_CHARACTERISTIC;
    add_char_params.uuid_type                = BLE_UUID_TYPE_VENDOR_BEGIN;
    add_char_params.max_len                  = BLE_ACTIVITY_MAX_TX_LENGTH;
    add_char_params.init_len                 = sizeof(uint8_t);
    add_char_params.is_var_len               = true;
    add_char_params.char_props.write         = 1;
    add_char_params.char_props.write_wo_resp = 1;

    add_char_params.read_access  = SEC_OPEN;
    add_char_params.write_access = SEC_OPEN;

    err_code = characteristic_add(p_activity->service_handle, &add_char_params, &p_activity->activity_req_handles);
    if (err_code != NRF_SUCCESS)
    {
        return err_code;
    }

    // Add the DATA Characteristic.
    memset(&add_char_params, 0, sizeof(add_char_params));
    add_char_params.uuid              = BLE_UUID_ACTIVITY_DATA_CHARACTERISTIC;
    add_char_params.uuid_type         = BLE_UUID_TYPE_VENDOR_BEGIN;
    add_char_params.max_len           = BLE_ACTIVITY_MAX_TX_LENGTH;
    add_char_params.init_len          = sizeof(uint8_t);
    add_char_params.is_var_len        = true;
    add_char_params.char_props.notify = 1;

    add_char_params.read_access       = SEC_OPEN;
    add_char_params.write_access      = SEC_OPEN;
    add_char_params.cccd_write_access = SEC_OPEN;

    err_code = characteristic_add(p_activity->service_handle, &add_char_params, &p_activity->activity_data_handles);
    if (err_code != NRF_SUCCESS)
    {
        return err_code;
    }

    // Add the DATETIME Characteristic.
    memset(&add_char_params, 0, sizeof(add_char_params));
    add_char_params.uuid                     = BLE_UUID_ACTIVITY_DATETIME_CHARACTERISTIC;
    add_char_params.uuid_type                = BLE_UUID_TYPE_VENDOR_BEGIN;
    add_char_params.max_len                  = BLE_ACTIVITY_MAX_RX_LENGTH;
    add_char_params.init_len                 = sizeof(uint32_t);
    //add_char_params.p_init_value             = &p_activity_init->timestamp;
    add_char_params.is_var_len               = false;
    add_char_params.char_props.read          = 1;
    add_char_params.char_props.write         = 1;

    add_char_params.read_access  = SEC_OPEN;
    add_char_params.write_access = SEC_OPEN;

    err_code = characteristic_add(p_activity->service_handle, &add_char_params, &p_activity->activity_datetime_handles);
    if (err_code != NRF_SUCCESS)
    {
        return err_code;
    }

    uint8_t battery = 5; 

    // Add the BATTERY Characteristic.
    memset(&add_char_params, 0, sizeof(add_char_params));
    add_char_params.uuid              = BLE_UUID_ACTIVITY_BATTERY_CHARACTERISTIC;
    add_char_params.uuid_type         = BLE_UUID_TYPE_VENDOR_BEGIN;
    add_char_params.max_len           = BLE_ACTIVITY_MAX_BATTERY_LENGTH;
    add_char_params.init_len          = sizeof(uint8_t);
    add_char_params.p_init_value      = &battery;
    add_char_params.is_var_len        = false;
    add_char_params.char_props.read   = 1;

    add_char_params.read_access       = SEC_OPEN;

    err_code = characteristic_add(p_activity->service_handle, &add_char_params, &p_activity->activity_battery_handles);
    if (err_code != NRF_SUCCESS)
    {
        return err_code;
    }

    uint8_t id[6] = {0};
    id[0] = (((NRF_FICR->DEVICEADDR[1] | 0xC000) & 0xFFFF) >> 8) & 0xFF;
    id[1] = NRF_FICR->DEVICEADDR[1] & 0xFF;
    id[2] = (NRF_FICR->DEVICEADDR[0] >> 24) & 0xFF;
    id[3] = (NRF_FICR->DEVICEADDR[0] >> 16) & 0xFF;
    id[4] = (NRF_FICR->DEVICEADDR[0] >> 8) & 0xFF;
    id[5] = NRF_FICR->DEVICEADDR[0] & 0xFF;

    // Add the ID Characteristic.
    memset(&add_char_params, 0, sizeof(add_char_params));
    add_char_params.uuid              = BLE_UUID_ACTIVITY_ID_CHARACTERISTIC;
    add_char_params.uuid_type         = BLE_UUID_TYPE_VENDOR_BEGIN;
    add_char_params.max_len           = BLE_ACTIVITY_MAX_ID_LENGTH;
    add_char_params.init_len          = 6;
    add_char_params.p_init_value      = id;
    add_char_params.is_var_len        = false;
    add_char_params.char_props.read   = 1;

    add_char_params.read_access       = SEC_OPEN;

    return characteristic_add(p_activity->service_handle, &add_char_params, &p_activity->activity_id_handles);
}


/*  Transmit activity data */
uint32_t ble_activity_data_send(ble_activity_t * p_activity, uint8_t * p_data, uint16_t * p_length, uint16_t conn_handle)
{
    ble_gatts_hvx_params_t     hvx_params;

    VERIFY_PARAM_NOT_NULL(p_activity);


    if (conn_handle == BLE_CONN_HANDLE_INVALID)
    {
        return NRF_ERROR_NOT_FOUND;
    }

    if (*p_length > BLE_ACTIVITY_MAX_TX_LENGTH)
    {
        return NRF_ERROR_INVALID_PARAM;
    }

    memset(&hvx_params, 0, sizeof(hvx_params));

    hvx_params.handle = p_activity->activity_data_handles.value_handle;
    hvx_params.p_data = p_data;
    hvx_params.p_len  = p_length;
    hvx_params.type   = BLE_GATT_HVX_NOTIFICATION;

    return sd_ble_gatts_hvx(conn_handle, &hvx_params);
}
