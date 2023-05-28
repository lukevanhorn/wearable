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

static nrfx_twi_t m_twi_master = NRFX_TWI_INSTANCE(0);

extern uint32_t get_current_time(void);

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

static void acc_int_event_handler(nrfx_gpiote_pin_t pin, nrf_gpiote_polarity_t action)
{
    uint32_t err_code;
    uint8_t reg_val = 0;
   

    err_code = acc_read_regs(REG_INT1_SRC, &reg_val, 1);
    RETURN_IF_ERROR(err_code);

    if((reg_val & 0x0F) != (current_orientation & 0x0F)) {
        NRF_LOG_DEBUG("mode movement orientation change %x, %x\r\n", reg_val, current_orientation);

        //orientation change
        current_orientation = (reg_val & 0x3f);

        acc_update_orientation();
    }
}

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
    NRF_LOG_DEBUG("New Orientation: %x, %x, %u\r\n", new_cfg, current_orientation, now - last_step);
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
    uint8_t acc_val[6] = {0};
    uint8_t read_count = 1;
    int16_t new_val = 0;
    uint16_t diff = 0;
    //int16_t x, y, z;

    //read the number of available samples
    err_code = acc_read_regs(REG_FIFO_SRC, &read_count, 1);
    RETURN_IF_ERROR(err_code);
    read_count &= 0x1F;

    memset(acc_val, 0, 6);

    while(read_count) {

        err_code = acc_read_regs(REG_X, acc_val, 6);
        RETURN_IF_ERROR(err_code);

        //x = (int16_t)((acc_val[0] << 8) + acc_val[1]);
        //y = (int16_t)((acc_val[2] << 8) + acc_val[3]);
        //z = (int16_t)((acc_val[4] << 8) + acc_val[5]);

        //NRF_LOG_DEBUG("%u,%u,%u,%u,%u,%u\n", acc_val[0],acc_val[1],acc_val[2],acc_val[3],acc_val[4],acc_val[5]);
        //NRF_LOG_DEBUG("%d,%d,%d\n", x, y, z);

    
        for(uint8_t i = 0; i < 3; i++) {
            new_val = (acc_val[(i * 2)] << 8) + (acc_val[(i * 2) + 1]);
            new_val >>= ACC_SENS_OFFSET;  //adjust for sensor resolution
            
            diff = (abs(acc_current_values[i] - new_val));
            acc_sum_diff += diff;

            //update the reference value
            acc_current_values[i] = new_val;
        }

        acc_sum_count++;

        read_count--;
    }

    //NRF_LOG_DEBUG("diff: %d, sum: %d, %u, %u\n", acc_sum_diff, acc_sum_count, (uint32_t)(acc_sum_diff / acc_sum_count), (uint8_t)(acc_sum_diff / acc_sum_count));

    return err_code;
}

static ret_code_t acc_read_regs(uint8_t reg, uint8_t * const p_content, uint8_t len)
{    
    ret_code_t err_code;

    if(len > 1) {
        reg |= 0x80; //set bit 7 for multi-byte reads
    }
    err_code = nrfx_twi_tx(&m_twi_master,
                               ACC_ADDR,
                               &reg,
                               len,
                               true);
    RETURN_IF_ERROR(err_code);

    err_code = nrfx_twi_rx(&m_twi_master,
                               ACC_ADDR,
                               p_content,
                               len);
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
    err_code = nrfx_twi_tx(&m_twi_master,
                              ACC_ADDR,
                               tx_buf,
                               2,
                               false );
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

    //Reset memory
    err_code = acc_write_regs(REG_CTRL5, 0x80);  
    RETURN_IF_ERROR(err_code);

    nrf_delay_ms(0x14); //Delay 20ms

    reg_val = 0;
    err_code = acc_read_regs(REG_WHOAMI, &reg_val, 1);
    RETURN_IF_ERROR(err_code);

    NRF_LOG_DEBUG("Device ID %lx\r\n", reg_val); 

    //1Hz, Enable All Axis
    err_code = acc_write_regs(REG_CTRL1, 0x17); 
    RETURN_IF_ERROR(err_code);

    //Disable Interrupts
    err_code = acc_write_regs(REG_CTRL3, 0x00); 
    RETURN_IF_ERROR(err_code);

    //Bypass Mode
    err_code = acc_write_regs(REG_FIFO_CTRL, 0x00); 
    RETURN_IF_ERROR(err_code);

    //Read reference register
    err_code = acc_read_regs(REG_REFERENCE, &reg_val, 1);
    RETURN_IF_ERROR(err_code);

    //Delay 10ms
    nrf_delay_ms(0x0A); 

    //Power Down, Disable all axis
    //err_code = acc_write_regs(REG_CTRL1, 0x00); 
    //RETURN_IF_ERROR(err_code);

    //Delay 10ms
    //nrf_delay_ms(0x0A); 

    reg_val = 0;
    err_code = acc_read_regs(REG_STATUS, &reg_val, 1);
    RETURN_IF_ERROR(err_code);
    
    //enable the interrupt
    //nrfx_gpiote_in_event_enable(ACC_INT, true);

    return 0;
}

ret_code_t acc_start_activity_monitor(void) 
{
    ret_code_t err_code;
    uint8_t reg_val;

    //10Hz, Enable all Axis
    err_code = acc_write_regs(REG_CTRL1, 0x27); 
    RETURN_IF_ERROR(err_code);

    //IA1 on INT1
    err_code = acc_write_regs(REG_CTRL3, 0x40); 
    RETURN_IF_ERROR(err_code);

    //FIFO Enabled, Latch Interrupt 1, D4D on Int 1 
    err_code = acc_write_regs(REG_CTRL5, 0x48);  
    RETURN_IF_ERROR(err_code);

    //FIFO Mode
    err_code = acc_write_regs(REG_FIFO_CTRL, 0x80); 
    RETURN_IF_ERROR(err_code);

    //INT1 Config: 6D,ZH,ZL,YH,YL,XH,XL
    err_code = acc_write_regs(REG_INT1_CFG, 0x4F); 
    RETURN_IF_ERROR(err_code);

    //INT1 Threshold
    err_code = acc_write_regs(REG_INT1_THS, 0x21); 
    RETURN_IF_ERROR(err_code);

    //Read reference register
    reg_val = 0;
    err_code = acc_read_regs(REG_REFERENCE, &reg_val, 1);
    RETURN_IF_ERROR(err_code);

    //Delay 10ms
    nrf_delay_ms(0x0A); 

    reg_val = 0;
    err_code = acc_read_regs(REG_INT1_SRC, &reg_val, 1);
    current_orientation = (reg_val & 0x3f);
    NRF_LOG_DEBUG("orientation %x, %x\r\n", reg_val, current_orientation);

    acc_update_orientation();

    //get the current values as reference
    err_code = acc_read_current_values();
    RETURN_IF_ERROR(err_code);
    
    //reset the counter and sum values
    step_count = 0;
    acc_sum_diff = 0;
    acc_sum_count = 0;

    //enable the interrupt
    nrfx_gpiote_in_event_enable(ACC_INT, true);

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