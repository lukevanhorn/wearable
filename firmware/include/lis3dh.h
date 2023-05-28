#include "acc.h"

#define ACC_ADDR (0x33 >> 1)
#define ACC_SENS_OFFSET         6
#define ACC_THS_OFFSET          4
#define ACC_THS_RESET           2
#define ACC_THS_MAX             0x7E

#define REG_TEMP_L              0x0C
#define REG_TEMP_H              0x0D
#define REG_WHOAMI              0x0F

#define ACC_DELAY              0x99

#define REG_TEMP_CFG            0x1F
#define BIT_TEMP_ENABLED        0xC0

#define REG_CTRL1               0x20
#define REG_CTRL2               0x21
#define REG_CTRL3               0x22
#define REG_CTRL4               0x23
#define REG_CTRL5               0x24
#define REG_CTRL6               0x25
#define REG_REFERENCE           0x26
#define REG_STATUS              0x27

#define REG_X                   0x28
#define REG_Y                   0x2A
#define REG_Z                   0x2C

#define REG_FIFO_CTRL           0x2E
#define REG_FIFO_SRC            0x2F

#define REG_INT1_CFG            0x30
#define REG_INT1_SRC            0x31
#define REG_INT1_THS            0x32
#define REG_INT1_DUR            0x33

#define REG_INT2_CFG            0x34
#define REG_INT2_SRC            0x35
#define REG_INT2_THS            0x36
#define REG_INT2_DUR            0x37

#define REG_CLK_CFG             0x38
#define REG_CLK_SRC             0x39
#define REG_CLK_THS             0x3A
#define REG_TIME_LIMIT          0x3B
#define REG_TIME_LATENCY        0x3C
#define REG_TIME_WINDOW         0x3D
