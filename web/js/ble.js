(function() {
    globalThis.ble = {

        available: function() {
            if(!navigator.bluetooth) {
                return false;
            }    

            return true;
        },

        discover: function(filters, services) {
            var self = this;

            return new Promise(function(resolve, reject) {

                if(self.bluetoothDevice && (!deviceId || self.bluetoothDevice.id == deviceId)) {
                    return resolve();
                }

                self.bluetoothDevice = undefined;

                console.log('Requesting Bluetooth Device...');

                let options = {};
                if(filters) {
                    options.filters = filters;
                } else {
                    options.acceptAllDevices = true;
                }

                if(services) {
                    options.optionalServices = services || [];
                }

                navigator.bluetooth.requestDevice(options)
                    .then(device => {
                        self.bluetoothDevice = device;
                        return resolve();
                    }).catch(e => {
                        app.showError('Error Requesting Devices');
                        return reject(e);
                    });     
            });
        },

        getConnectedDevice: function() {
            var self = this;

            return {
                id: self.bluetoothDevice.id,
                bleId: self.bluetoothDevice.id,
                name: self.bluetoothDevice.name,
                timestamp: new Date().valueOf()
            };
        },

        isConnected: function(deviceId) {
            var self = this;

            if(self.bluetoothDevice && self.bluetoothDevice.gatt.connected && (!deviceId || self.bluetoothDevice.id == deviceId)) {
                return true;
            }

            return false;
        },

        connect: function(filters, services) {
            var self = this;

            return new Promise((resolve,reject) => {   
                if (self.isConnected()) {
                    return resolve(self.getConnectedDevice());
                } 

                self.discover(filters, services).then(_ => {
                    console.log('Connecting to Device', self.bluetoothDevice.name);
                    app.updateStatus('Connecting to ' + self.bluetoothDevice.name);

                    return self.bluetoothDevice.gatt.connect();
                }).then(server => {
                    self.bluetoothServer = server;

                    return resolve(self.getConnectedDevice());
                }).catch(e => {
                    app.showError(e);
                    return reject(e);
                }); 
            });
        },

        decode: function(value) {
            let buffer = new Uint8Array(value.byteLength);
            for(var i = 0; i < value.byteLength; i++) {
                buffer[i] = value.getUint8(i);
            }

            return buffer.toHexString();
        },

        selectService: function(serviceUUID) {
            var self = this;

            return new Promise((resolve,reject) => {   
                self.bluetoothServer.getPrimaryService(serviceUUID).then(service => {
                    self.bluetoothService = service;
                    return resolve();
                }).catch(e => {
                    app.showError('Error Selecting Service');
                    return reject(e);
                }); 
            });
        },

        disconnect: function() {
            var self = this;

            return new Promise((resolve,reject) => {
                
                console.log('disconnecting');

                if (self.isConnected()) {
                    self.bluetoothServer.disconnect();
                }

                return resolve();
            }).catch(e => {
                console.log(e);

                return resolve();
            });
        },

        reset: function() {
            var self = this;

            return new Promise((resolve,reject) => {

                self.disconnect().then(_ => {
                    self.bluetoothDevice = undefined;
                    self.bluetoothServer = undefined;
                    self.bluetoothService = undefined;        

                    return resolve();
                }).catch(e => {
                    console.log(e);
    
                    return resolve();
                });
            });
        },

        onCharChanged: function(event) {
            let value = ble.decode(event.target.value);

            if(ble._oncharchanged) {
                ble._oncharchanged(value);
            }
        },

        readCharacteristic: function(charUUID) {
            var self = this;

            return new Promise((resolve,reject) => {   
                self.bluetoothService.getCharacteristic(charUUID).then(characteristic => {
                    return characteristic.readValue();
                }).then(value => {
                    value = ble.decode(value);
                    return resolve(value);
                }).catch(e => {
                    console.log(e);
                    return reject(e);
                });
            });
        },

        writeCharacteristic: function(charUUID, value) {
            var self = this;

            return new Promise((resolve,reject) => {   
                self.bluetoothService.getCharacteristic(charUUID).then(characteristic => {
                    return characteristic.writeValue(value.toUint8Array());
                }).then(_ => {
                    return resolve();
                }).catch(e => {
                    console.log(e);
                    return reject(e);
                });
            });
        },

        writeCharacteristicWithResponse: function(charUUID, value) {
            var self = this;
            
            return new Promise((resolve,reject) => {   

                self._oncharchanged = function(value) {
                    return resolve(value);
                }

                self.bluetoothService.getCharacteristic(charUUID).then(characteristic => {
                    app.updateStatus('writing characteristic with Response with value ' + value);

                    return characteristic.writeValue(value.toUint8Array());
                }).catch(e => {
                    console.log(e);
                    return reject(e);
                });
            });
        },

        setCharacteristicNotification: function(charUUID, enabled) {
            var self = this;
            
            console.log('setting characteristic notification to', enabled);

            return new Promise((resolve,reject) => {
                self.bluetoothService.getCharacteristic(charUUID).then(characteristic => {
                    if(enabled) {
                        characteristic.addEventListener('characteristicvaluechanged', ble.onCharChanged);
                        return characteristic.startNotifications();
                    } else {
                        characteristic.removeEventListener('characteristicvaluechanged', ble.onCharChanged);
                        return characteristic.stopNotifications();
                    }

                }).then(_ => {
                    return resolve();
                }).catch(e => {
                    return reject(e);
                });
            });
        },

        listenForCharacteristicChanges: function() {
            var self = this;

            return new Promise((resolve,reject) => {   

                self._oncharchanged = function(value) {
                    return resolve(value);
                }
            });
        },

        readDescriptor: function(charUUID, descUUID) {
            var self = this;

            return new Promise((resolve,reject) => {   
                
                self.bluetoothService.getCharacteristic(charUUID).then(characteristic => {
                    return characteristic.getDescriptor(descUUID);
                }).then(descriptor => {
                    return descriptor.readValue();
                }).then(value => {
                    value = ble.decode(value);
                    return resolve(value);
                }).catch(e => {
                    console.log(e);
                    return reject(e);
                });
            });
        },

        writeDescriptor: function(charUUID, descUUID, value) {
            var self = this;
            return new Promise((resolve,reject) => {   
                
                self.bluetoothService.getCharacteristic(charUUID).then(characteristic => {
                    return characteristic.getDescriptor(descUUID);
                }).then(descriptor => {
                    return descriptor.writeValue(value.toUint8Array());
                }).then(_ => {
                    return resolve();
                }).catch(e => {
                    console.log(e);
                    return reject(e);
                });
            });
        }
    }
})();