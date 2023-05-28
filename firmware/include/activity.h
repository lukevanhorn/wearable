#include <stdint.h>

#ifndef ACTIVITY_H
#define ACTIVITY_H

//storage memory locations

typedef enum 
{
    ACTIVITY_CATEGORY_REMOVED = 0,
    ACTIVITY_CATEGORY_ACTIVE,
    ACTIVITY_CATEGORY_SLEEP,
    ACTIVITY_CATEGORY_DEEP_SLEEP
} activity_category_t;

typedef struct {
    uint32_t timestamp;    
    uint8_t intensity;
    uint8_t steps;        
    uint8_t temperature;
    uint8_t category; 
} activity_sample_t;

void activity_init_buffer(void);

void activity_add_sample(uint32_t ts, uint8_t intensity, uint16_t steps, uint8_t temperature);

void activity_inc_ptr(activity_sample_t **ptr);

uint32_t activity_get_start_ptr(uint32_t start, activity_sample_t **ptr);

void activity_time_changed(uint32_t start);

#endif //ACTIVITY_H