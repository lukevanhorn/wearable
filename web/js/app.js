

(function() {
    window.storage = (window.localStorage || window.sessionStorage);

    globalThis.app = {
        init: function() {
            var self = this;  

            window.addEventListener('resize', app.resize);
            self.resize();
        },
    
        getScreenHeight: function() {
            return Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
        },

        getScreenWidth: function() {
            return Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
        },

        isMobile: function() {
            var self = this;

            return (self.getScreenWidth() <= 800);
        },

        resize: function() {
            var self = this;
                    
            var height = app.getScreenHeight();

            var top = 0;
            var header = document.getElementById('header-main');
            if(header && header.checkVisibility()) {
                top = header.getBoundingClientRect().height;
            }
            height -= (top + 1);

            document.getElementById('mainView').style.height = height + 'px';
            
            health.show();
            
            return true;
        },

        showError: function(message) {
            if(!message) {
                return;
            }

            var statusItem = document.getElementById('statusModal');
            if(!statusItem || !statusItem.checkVisibility()) {
                return app.showStatus('Error: ' + message);
            }
            
            app.updateStatus('Error: ' + message);
        },
        
        showStatus: function(message) {
            var self = this;

            if(!message) {
                return;
            }

            var statusItem = document.getElementById('statusModal');
            if(!statusItem) {
                return;
            }

            let elem = statusItem.querySelector('.app-wait');
            elem.classList.remove('hidden');
  
            elem = statusItem.querySelector('.status-message');
            elem.innerHTML = message;

            statusItem.querySelector('.status-cancelButton').onclick = function() {

                app.updateStatus('Operation Cancelled');

                setTimeout(() => { 
                    self.hideStatus();
                }, 5000);
            };

            self.lastStatusUpdate = new Date().valueOf();

            statusItem.classList.remove('hidden');
        },

        updateStatus: function(message) {
            var self = this;

            console.log('Status Update: ' + message);

            self.lastStatusUpdate = new Date().valueOf();

            var statusItem = document.getElementById('statusModal');
            if(!statusItem || !statusItem.checkVisibility()) {
                return;
            }

            var display = statusItem.querySelector('.status-message');

            if(display) {
                display.innerHTML += (display.innerHTML ? '\r\n' + message : message);
                display.parentElement.scrollTop = display.scrollHeight;
            }
        },

        hideStatus: function(delay) {
            var self = this;

            var statusItem = document.getElementById('statusModal');
            if(!statusItem || !statusItem.checkVisibility()) { 
                return;
            }

            if(delay || (new Date().valueOf() - self.lastStatusUpdate || 0) < 2000) {
                return setTimeout(function() { self.hideStatus(); }, delay || 500);
            }

            statusItem.classList.add('hidden');
        },

        /*

        storeData: function() {
            var self = this;

            if(!window.storage) {
                return;
            }

            var data = JSON.stringify(window.wearable_data || []);

            window.storage.setItem('wearable_data', data);          
        },
    
        loadData: function() {
            var self = this;

            window.wearable_data = [];

            if(!window.storage) {
                return;
            }

            try {
                var data = window.storage.getItem('wearable_data');
                if(data && data != 'undefined' && data != "[]") {
                    window.wearable_data = JSON.parse(data);                    
                }

                if(window.wearable_data && window.wearable_data.length) {
                    window.wearable_data.sort(function(a,b) { a.lastTimestamp > b.lastTimestamp ? 1 : -1 });
                }

            } catch (e) {
                console.log(e);
                window.wearable_data = [];
            }
        },

        getDevice: function(id) {
            var self = this;

            let device = wearable_data.find(d => d.id == id);
            if(!device) {
                device = { id: id, data: [] };
                wearable_data.push(device);
            }

            return device;
        },

        updateDeviceData: function(id, data) {
            var self = this;

            let device = app.getDevice(id);

            device.data = (device.data || []).concat(data || []);

            if(device.data.length) {
                device.data.sort((a,b) => a.timestamp > b.timestamp ? -1 : 1);
                device.lastTimestamp = device.data[device.data.length - 1].timestamp;
            }

            app.storeData();
        }

        */
    };
})();
    
    