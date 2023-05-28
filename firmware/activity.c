#include "activity.h"
#include <string.h>

#define ACTIVITY_MAX_SAMPLE_COUNT   2880 //(48 hours) 

activity_sample_t activity_sample_buffer[ACTIVITY_MAX_SAMPLE_COUNT]; 
activity_sample_t * activity_buffer_begin = &activity_sample_buffer[0];
activity_sample_t * activity_buffer_end = &activity_sample_buffer[ACTIVITY_MAX_SAMPLE_COUNT - 1]; 
activity_sample_t * activity_buffer_ptr = &activity_sample_buffer[0];

uint32_t sleep_count = 0;
uint32_t removed_count = 0;

void activity_init_buffer(void) 
{
    memset(activity_sample_buffer, 0, sizeof(activity_sample_t) * ACTIVITY_MAX_SAMPLE_COUNT);

    activity_buffer_ptr = &activity_sample_buffer[0];
}

void activity_inc_ptr(activity_sample_t **ptr) 
{ 
    if((*ptr)->timestamp == 0) {
        return;
    }

    (*ptr) = (*ptr) + 1;
    if((*ptr) > activity_buffer_end) {
        (*ptr) = activity_buffer_begin;
    }
}

void activity_add_sample(uint32_t ts, uint8_t intensity, uint16_t steps, uint8_t temperature) 
{
    uint8_t category = ACTIVITY_CATEGORY_ACTIVE;

    activity_inc_ptr(&activity_buffer_ptr);

    memset(activity_buffer_ptr, 0, sizeof(activity_sample_t));

    /* determine the category based on recent movement */
    if(intensity > 20) {
        //active state
        //reset the counters
        sleep_count = 0;
        removed_count = 0;
    } else {
        //sleep or removed states
        if(intensity == 0) {
            removed_count++;
        } else {
            //reset on any movement
            removed_count = 0;
        }

        if(removed_count > 5) {
            //no movement for five or more minutes
            category = ACTIVITY_CATEGORY_REMOVED; 
        } else { 
            //sleep indicator
            sleep_count++;
            if(sleep_count > 5) {
                if(sleep_count < 15) {
                    category = ACTIVITY_CATEGORY_SLEEP; 
                } else {
                    category = ACTIVITY_CATEGORY_DEEP_SLEEP; 
                }
            }
        }
    } 

    activity_buffer_ptr->timestamp = ts;
    activity_buffer_ptr->intensity = intensity;
    activity_buffer_ptr->steps = (uint8_t)(steps & 0xFF);
    activity_buffer_ptr->temperature = temperature;
    //if the step count is over 255, set the flag bit in the category field [0001 0000]
    activity_buffer_ptr->category = (((uint8_t)(steps >> 4)) & 0xF0) + category;
}

uint32_t activity_get_start_ptr(uint32_t start, activity_sample_t **ptr) 
{
    (*ptr) = activity_buffer_ptr;  //set to the current position

    uint32_t count = 0;
    activity_sample_t * prev_ptr = activity_buffer_ptr;

    while(prev_ptr->timestamp != 0 && prev_ptr->timestamp > start && prev_ptr->timestamp <= (*ptr)->timestamp) {
        (*ptr) = prev_ptr;
        count++;
        prev_ptr--;
        if(prev_ptr < activity_buffer_begin) {
            prev_ptr = activity_buffer_end;
        } 
    }

    return count;
}

void activity_time_changed(uint32_t start) 
{
    activity_get_start_ptr(start, &activity_buffer_ptr);
}