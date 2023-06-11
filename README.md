# Wearable - Bluetooth Sleep and Activity Tracker

Example bluetooth wearable code to track sleep and activity using the nRF52832 and LIS3DH accelerometer.

This is functional code that logs average intensity data once a minute. Logged data is downloaded over a bluetooth connection to a phone or computer for analysis. This has been tested against the very popular Mi Band 3 and has shown to be nearly identical.

Depending on the hardware, this will run for 3 - 5 months on a 2032 coin cell. 

I've recently changed from a FIFO driven interrupt to timer based reading of accelerometer data after finding an intermittent bug that prevented the SoC from sleeping properly. There's some data in the Errata about this and I hope to have that worked out eventually. However, the difference in power draw is negligible. 

I'm currently working on a Zephyr RTOS version of this project using the nRF Connect SDK and will add it to the repository when completed.

An example Web-Bluetooth application is provided (web folder). 

A common method for calculating sleep stage:

- intensity under 20 is considered sitting / low activity
- more than 5 minutes of intensity under 5-10 can be considered entering sleep
- more than 15 minutes of uninterrupted sleep is considered deep sleep

## Hardware Setup

The accelerometer pin definitions are set in the custom_board.h file in the board directory.

## Firmware Functionality

On initial startup the device will beging to advertise once a second. The accelerometer will be put into sleep mode and will not record activity until a bluetooth connection has been established and the time has been set. Once the time has been set, a rolling buffer will maintain 48 hours worth of activity data.

## Bluetooth Profile

### Primary service characteristics

- **ID:** *Read* Retrieves the unique device ID (Bluetooth Mac Address).
- **DATETIME:** *Write* Used to set the date/time (**seconds** since 1970).
- **BATTERY:** *Read* Retrieves the current battery level
- **ACTIVITY_REQ:** *Write* Requests activity data from the datetime provided
- **ACTIVITY_DATA**: *Read/Notify* Activity log data response.

## Prerequisites

[nRF-SDK version 17.1.0](https://www.nordicsemi.com/Products/Development-software/nrf5-sdk/download)

Extract to a directory near root to avoid directory length issues when building

```
C:\nordic_semi\nRF5_SDK_17.1.0_ddde560
```

[Segger Embedded Studio version 6.30](https://www.segger.com/downloads/embedded-studio/)

Add Global Macros under Tools -> Options

```
CMSIS_CONFIG_TOOL=C:\nordic_semi\nRF5_SDK_17.1.0_ddde560\external_tools\cmsisconfig\CMSIS_Configuration_Wizard.jar
nRF5SDK=C:\\nordic_semi\\nRF5_SDK_17.1.0_ddde560
```

#### GCC Toolchain

In order to build some bootloader libraries, gcc / make will need to be installed:

[5.4-2016-q3-update of the GCC compiler toolchain for ARM](https://launchpad.net/gcc-arm-embedded/+download)

And make on windows:

[MinGW](https://sourceforge.net/projects/mingw/)

* Install the msys packages
* create a make.bat file in c:\mingw\bin

```
@echo off
"%~dp0mingw32-make.exe" %*
```

update the [nRFSDK]/components/toolchain/gcc/Makefile.windows

```
GNU_INSTALL_ROOT := C:/Program Files (x86)/GNU Tools ARM Embedded/5.4 2016q3/bin/
GNU_VERSION := 5.4.1
GNU_PREFIX := arm-none-eabi
```

#### nRFUtils (required)

#### nRF Connect (optional, but useful)

# Notes

The debug and release projects have NRF_LOG_ENABLED set/unset in the sdk_config.h
