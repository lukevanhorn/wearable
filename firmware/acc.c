#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "acc.h"
#include "nrfx_gpiote.h"
#include "nrfx_twi.h"
#include "nrf_delay.h"
#include "macros_common.h"
#include "app_error.h"
#include "nrfx_systick.h"
#include "nrf_log.h"
#include "nrf_log_ctrl.h"
#include "nrf_log_default_backends.h"

#include "custom_board.h"
#include "lis3dh.h"

//macros to read and set a single register
#define REG_SET(reg,val)  RETURN_IF_ERROR(acc_write_regs(reg, val))
#define REG_GET(reg,val)  *val = 0; RETURN_IF_ERROR(acc_read_regs(reg, val, 1))

#define ACC_STEP_THRESHOLD      0x14
#define ACC_SENS_OFFSET         6

static nrfx_twi_t m_twi_master = NRFX_TWI_INSTANCE(0);

extern uint32_t get_current_time(void);
extern void update_current_time(void);

//  **** private functions ****
static ret_code_t acc_read_regs(uint8_t reg, uint8_t * const p_content, uint8_t len);
static ret_code_t acc_write_regs(uint8_t reg, uint8_t val);
static ret_code_t acc_gpio_init(void);
static void acc_update_orientation(void);


//movement storage variables
volatile int16_t acc_current_values[3] = {0}; //current values
volatile int32_t acc_sum_diff = 0; //sum of changes
volatile int32_t acc_sum_count = 0;

volatile uint16_t step_count = 0;  
volatile uint32_t last_step = 0; //keeping track of stride

volatile uint8_t current_orientation = 0;  //ZH,ZL,YH,YL,XH,ZL

int8_t orientation[3] = {0,0,0};

static ret_code_t acc_gpio_init(void) 
{
    ret_code_t err_code = nrfx_gpiote_init();
    APP_ERROR_CHECK(err_code);

    //Interrupt 1
    nrfx_gpiote_in_config_t in_config = NRFX_GPIOTE_CONFIG_IN_SENSE_LOTOHI(false);
    err_code = nrfx_gpiote_in_init(ACC_INT, &in_config, acc_int_event_handler);
    APP_ERROR_CHECK(err_code);

    //CS
    #ifdef TWI_CS
        nrfx_gpiote_out_config_t out_config = NRFX_GPIOTE_CONFIG_OUT_SIMPLE(false);
        nrfx_gpiote_out_init(TWI_CS, &out_config);
        nrfx_gpiote_out_set(TWI_CS);
    #endif
    
    //wait for startup
    nrf_delay_ms(200);

    return err_code;
}

static void acc_update_orientation(void) 
{
    //enable interrupts for axis directions not currently active
    uint8_t new_cfg = (0x40 | (~current_orientation & 0x3F));

    uint32_t now = get_current_time();
    NRF_LOG_DEBUG("Orientation: %s%s%s%s%s%s", (current_orientation & 0x20 ? "ZH" : ""), (current_orientation & 0x10 ? "ZL" : ""), (current_orientation & 0x08 ? "YH" : ""), (current_orientation & 0x04 ? "YL" : ""), (current_orientation & 0x02 ? "XH" : ""), (current_orientation & 0x01 ? "XL" : ""));
    if(last_step && ((now - last_step) < 3)) {
        if(step_count < 512) {
            step_count++;
        }
        NRF_LOG_DEBUG("Step: %u", step_count);
    } 

    last_step = now;
    
    //Update the interrupt configuration
    ret_code_t err_code = acc_write_regs(REG_INT1_CFG, new_cfg); 
    RETURN_IF_ERROR(err_code);
}

ret_code_t acc_read_current_values(void) 
{
    ret_code_t err_code = 0;
    uint8_t acc_val[192] = {0};
    uint8_t read_count = 1;
    int16_t new_val = 0;
    int8_t new_orientation = 0;
    uint16_t diff = 0;
    uint8_t step = 0;
    uint8_t index = 0;

    //update_current_time();

    //read the number of available samples
    REG_GET(REG_FIFO_SRC, &read_count);
    read_count &= 0x1F;

    memset(acc_val, 0, read_count * 6);

    err_code = acc_read_regs(REG_X, acc_val, read_count * 6);
    RETURN_IF_ERROR(err_code);

    //NRF_LOG_HEXDUMP_DEBUG(acc_val, read_count * 6);

    for(uint8_t s = 0; s < read_count; s++) {

        step = 0;

        for(uint8_t i = 0; i < 3; i++) {
            index = (s*6) + (i * 2);
            new_val = (int16_t)((acc_val[index] << 8) | (acc_val[index+1])) >> ACC_SENS_OFFSET;
            diff = (abs(acc_current_values[i] - new_val));
            acc_sum_diff += diff;
            
            //update the reference value
            acc_current_values[i] = new_val;
            
            //check for step 
            new_orientation = (new_val < (ACC_STEP_THRESHOLD * -1) ? -1 : (new_val > ACC_STEP_THRESHOLD ? 1 : 0));
            if(orientation[i] != new_orientation && new_orientation != 0) {
                step = 1;
                //NRF_LOG_DEBUG("Orientation Change %d %d %u %d",orientation[i],new_orientation, s, new_val);
                orientation[i] = new_orientation;
            } 
        }
        
        acc_sum_count++;

        if(step) {
            step_count += step;
            NRF_LOG_DEBUG("Step %u %d%d%d",step_count,orientation[0],orientation[1],orientation[2]);
        }

        //NRF_LOG_DEBUG("%d %d %d",(int16_t)((acc_val[(s*6)] << 8) | (acc_val[(s*6)+1])) >> ACC_SENS_OFFSET,(int16_t)((acc_val[(s*6)+2] << 8) | (acc_val[(s*6)+3])) >> ACC_SENS_OFFSET,(int16_t)((acc_val[(s*6)+4] << 8) | (acc_val[(s*6)+5])) >> ACC_SENS_OFFSET);

    }     

    return err_code;
}

static ret_code_t acc_read_regs(uint8_t reg, uint8_t * const p_content, uint8_t len)
{    
    ret_code_t err_code;

    if(len > 1) {
        reg |= 0x80; //set bit 7 for multi-byte reads
    }

    err_code = nrfx_twi_tx(&m_twi_master, ACC_ADDR, &reg, len, true);
    RETURN_IF_ERROR(err_code);

    err_code = nrfx_twi_rx(&m_twi_master, ACC_ADDR, p_content, len);
    RETURN_IF_ERROR(err_code);

    return err_code;
}

static ret_code_t acc_write_regs(uint8_t reg, uint8_t val)
{
    ret_code_t  err_code;
    uint8_t     tx_buf[2];

    // Data to send: Register address + contents.
    tx_buf[0] = reg;
    tx_buf[1] = val;

    // Perform SPI transfer.
    err_code = nrfx_twi_tx(&m_twi_master, ACC_ADDR, tx_buf, 2, false);
    RETURN_IF_ERROR(err_code);

    return 0;
}

ret_code_t acc_init() 
{
    ret_code_t err_code;
    uint8_t reg_val;

    err_code = acc_gpio_init();
    RETURN_IF_ERROR(err_code);

    static const nrfx_twi_config_t twi_config =
    {
        .scl = TWI_SCL,
        .sda = TWI_SDA,
        .frequency          = NRF_TWI_FREQ_100K,
        .interrupt_priority = APP_IRQ_PRIORITY_HIGH,
        .hold_bus_uninit = false
    };

    err_code = nrfx_twi_init(&m_twi_master, &twi_config, NULL, NULL);
    RETURN_IF_ERROR(err_code);

    nrfx_twi_enable(&m_twi_master);

    REG_SET(REG_CTRL5, 0x80);           //Reset memory
    nrf_delay_ms(0x14);                 //Delay 20ms
    
    REG_GET(REG_WHOAMI, &reg_val);      //read the device ID
    NRF_LOG_DEBUG("Device ID %lx\r\n", reg_val);
       
    return 0;
}

ret_code_t acc_start_activity_monitor(void) 
{
    ret_code_t err_code;

    REG_SET(REG_CTRL1, 0x27);           //10Hz, Enable all Axis

    nrf_delay_ms(0x14);                 //Delay 20ms

    //REG_SET(REG_CTRL3, 0x04);           //WTM1 on INT1  
    //REG_SET(REG_CTRL5, 0x40);           //FIFO Enabled
    //REG_SET(REG_FIFO_CTRL, 0x94);       //Steam to FIFO Mode, Interrupt on 20 samples   
    
    REG_SET(REG_CTRL3, 0x00);           //Clear Interrupts
    REG_SET(REG_CTRL5, 0x40);           //FIFO Enabled
    REG_SET(REG_FIFO_CTRL, 0x80);       //Stream to FIFO Mode

    //get the current values as reference
    err_code = acc_read_current_values();
    RETURN_IF_ERROR(err_code);

    //reset the counter and sum values
    step_count = 0;
    acc_sum_diff = 0;
    acc_sum_count = 0;

    //enable the interrupt
    //nrfx_gpiote_in_event_enable(ACC_INT, true);

    return err_code;
}

//read current peak intensity and step count
void acc_get_activity(uint8_t *p_intensity, uint16_t *steps)
{
    uint32_t average_intensity = 0;

    average_intensity = (uint32_t)(acc_sum_diff / acc_sum_count);
    
    *p_intensity = (uint8_t)average_intensity;
    *steps = step_count;

    step_count = 0;
    acc_sum_diff = 0;
    acc_sum_count = 0;
}