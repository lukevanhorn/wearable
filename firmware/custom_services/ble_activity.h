
/** 
	Activity Service - UUID: 0000fee0-0000-1000-8000-00805f9b34fb
	->TEMP Sensor Characteristic - UUID: 7f6d3001-b996-5845-90f3-0796dcd321d8

 */

#ifndef BLE_ACTIVITY_H__
#define BLE_ACTIVITY_H__

#include <stdint.h>
#include <stdbool.h>		
#include "ble_srv_common.h" 
#include "nrf_sdh_ble.h"

/*
    Base UUID for activity service.  You can randomly generate your own custom UUID here.
    
    ACTIVITY_SERVICE: '77e40000-b4f6-42fc-b3b0-87f58243899e'
*/

#define BLE_ACTIVITY_BLE_OBSERVER_PRIO 2

#define ACTIVITY_BASE_UUID                                              {{0x9e, 0x89, 0x43, 0x82, 0xf5, 0x87, 0xb0, 0xb3, 0xfc, 0x42, 0xf6, 0xb4, 0x00, 0x00, 0xe4, 0x77}}

#define BLE_UUID_ACTIVITY_SERVICE                                       0x0000
#define BLE_UUID_ACTIVITY_REQ_CHARACTERISTIC                            0x0001
#define BLE_UUID_ACTIVITY_DATA_CHARACTERISTIC                           0x0002
#define BLE_UUID_ACTIVITY_DATETIME_CHARACTERISTIC                       0x0003
#define BLE_UUID_ACTIVITY_BATTERY_CHARACTERISTIC                        0x0004
#define BLE_UUID_ACTIVITY_ID_CHARACTERISTIC                             0x0005

#define BLE_ACTIVITY_MAX_RX_LENGTH      4   //length of datetime uint32_t
#define BLE_ACTIVITY_MAX_TX_LENGTH      244  //MTU MAX LENGTH - 3
#define BLE_ACTIVITY_MAX_BATTERY_LENGTH 1   //one byte
#define BLE_ACTIVITY_MAX_ID_LENGTH      6   //6 byte mac address

/* Macro for defining instance */
#define BLE_ACTIVITY_DEF(_name)                                                                          \
        static ble_activity_t _name;                                                                             \
        NRF_SDH_BLE_OBSERVER(_name ## _obs, BLE_ACTIVITY_BLE_OBSERVER_PRIO, ble_activity_on_ble_evt, &_name)
					 

 /**@brief Service event types. */
typedef enum
{
    BLE_ACTIVITY_REQ,      /**< Data req received. */
    BLE_ACTIVITY_DATA_TX_RDY,  /** Client is ready for more activity data */
    BLE_ACTIVITY_DATA_NOTIFICATION_ENABLED, /**< Notification has been enabled. */
    BLE_ACTIVITY_DATA_NOTIFICATION_DISABLED, /**< Notification has been disabled. */
    BLE_ACTIVITY_READ_DATETIME,     
    BLE_ACTIVITY_WRITE_DATETIME,    
    BLE_ACTIVITY_READ_BATTERY,    
    BLE_ACTIVITY_READ_ID
} ble_activity_evt_type_t;


//forward declaration
typedef struct ble_activity_s ble_activity_t;

/**@brief Activity Service event. */
typedef struct
{
    ble_activity_evt_type_t type;    /**< Type of event. */
    ble_activity_t          * p_activity;       /**< A pointer to the instance. */
    uint16_t                conn_handle; /**< Connection handle. */
    uint16_t len;
    uint8_t data[22];
    uint32_t                activity_req_data;
    uint32_t                datetime_data;
} ble_activity_evt_t;


/**@brief Activity Service event handler type. */
typedef void (* ble_activity_evt_handler_t) (ble_activity_evt_t * p_evt);

/**@brief Activity Service init structure.*/
typedef struct
{
    ble_activity_evt_handler_t  evt_handler;
    uint32_t timestamp; 
    uint8_t battery;         
} ble_activity_init_t;


/**@brief Activity Service structure. This contains various status information for the service. */
struct ble_activity_s
{
    uint8_t                  uuid_type; 
    uint16_t                 service_handle;            /**< Handle of Activity Service (as provided by the BLE stack). */
    ble_gatts_char_handles_t activity_req_handles;     /**< Handles related to the Activity Request characteristic. */
    ble_gatts_char_handles_t activity_data_handles;     /**< Handles related to the Activity Data characteristic. */
    ble_gatts_char_handles_t activity_datetime_handles; /**< Handles related to the DateTime characteristic. */
    ble_gatts_char_handles_t activity_battery_handles; /**< Handles related to the Battery characteristic. */
    ble_gatts_char_handles_t activity_id_handles;       /**< Handles related to the ID characteristic. */
    ble_activity_evt_handler_t    evt_handler;               /**< Event handler to be called for handling events in the Activity Service. */
};


/** Function for initializing the Activity Service.
 *
 *  Output parameter: p_activity     Pointer to the service instance. Configured by this function.
 *  Input parameter:p_activity_init  Pointer to the initialization structure. Supplied by the application. 
 *
 *  Return NRF_SUCCESS If the service was initialized successfully. Otherwise, an error code is returned.
 */
uint32_t ble_activity_init(ble_activity_t * p_activity, const ble_activity_init_t * p_activity_init);

/** Main BLE events handler 
 * This function handles only the BLE_GATTS_EVT_WRITE events from the BLE stack that are of interest to the Activity 
 * Service. It is registered to listen to BLE events through the macro BLE_ACTIVITY_DEF()
 * Input parameter: p_ble_evt  Event received from the BLE stack.
 * Input parameter: p_context  Activity Service instance "Configured in BLE_ACTIVITY_DEF()".
 */
void ble_activity_on_ble_evt(ble_evt_t const * p_ble_evt, void * p_context);

/*
 * This function sends the activity data as characteristic notification 
 * @param[in]     p_activity  Pointer to the Activity Service structure.
 * @param[in]     p_data      Data to be sent
 * @param[in,out] p_length    Pointer Length of the data. Amount of sent bytes.
 * @param[in]     conn_handle Connection Handle of the destination client.
 */

ret_code_t ble_activity_data_send(ble_activity_t * p_activity, uint8_t * p_data, uint16_t * p_length, uint16_t conn_handle);

#endif // BLE_ACTIVITY_H__
