#include <stdint.h>
#include "sdk_errors.h"

#ifndef ACC_H
#define ACC_H

typedef struct
{
  uint16_t x;
  uint16_t y;
  uint16_t z;
} acc_values_t;

ret_code_t acc_init(void);
ret_code_t acc_start_activity_monitor(void);
ret_code_t acc_start_sleep_mode(void);
ret_code_t acc_read_current_values(void);
void acc_get_activity(uint8_t *p_intensity, uint16_t *step_count);

#endif //ACC_H