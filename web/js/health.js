(function() {
    globalThis.health = {

        ACTIVITY_SERVICE: '77e40000-b4f6-42fc-b3b0-87f58243899e',
        DATA_REQ_CHARACTERISTIC: '77e40001-b4f6-42fc-b3b0-87f58243899e',
        DATA_RESP_CHARACTERISTIC: '77e40002-b4f6-42fc-b3b0-87f58243899e',
        DATETIME_CHARACTERISTIC: '77e40003-b4f6-42fc-b3b0-87f58243899e',
        BATTERY_CHARACTERISTIC: '77e40004-b4f6-42fc-b3b0-87f58243899e',
        ID_CHARACTERISTIC: '77e40005-b4f6-42fc-b3b0-87f58243899e',

        colors: ['#8C191D', '#1b7a87','#21178c','#110b03', '#767f0f'],

        startTime: undefined,
        endTime: undefined,
        metric: 'intensity',
        deviceList: [],

        show: function() {
            var self = this;

            self.deviceList = [];
            self.device = undefined;

            self.loadData();

            self.updateScreen();
        },
    
        updateScreen: function(updateBounds) {
            var self = this;

            //self.updateDateDisplay();
            self.updateDashboard();
        },

        connect: function() {
            var self = this;

            app.showStatus('Connecting to Device');

            self.device = undefined;

            ble.reset().then(_ => {
                return ble.connect([{namePrefix: 'Band'}], [self.ACTIVITY_SERVICE]);
            }).then(device => {
                self.device = device;
                //set the primary service
                return ble.selectService(self.ACTIVITY_SERVICE);
            }).then(_ => {
                //read the id/mac
                return ble.readCharacteristic(self.ID_CHARACTERISTIC);
            }).then(id => {
                app.updateStatus('Device ID: ' + id);
                self.device = self.deviceList.find(d => d.id == id);
                if(!self.device) {
                    self.device = { id: id, data: [] };
                    self.deviceList.push(self.device);
                }

                //read the battery level
                return ble.readCharacteristic(self.BATTERY_CHARACTERISTIC);
            }).then(result => {
                self.device.battery = Number.parseInt(result,16);   
                app.updateStatus('Battery: ' + self.device.battery);

                //set the time
                return ble.writeCharacteristic(self.DATETIME_CHARACTERISTIC, Math.round(new Date().valueOf() / 1000).toString(16));
            }).then(_ => {
                //load data from last sample or the last 24 hours
                let start = self.device.lastTimestamp || (new Date().valueOf() - (24 * 60 * 60 * 1000));

                app.updateStatus('Syncing Activity Data from ' + new Date(start).toISOString());

                return self.getActivityData(start);
            }).then(samples => {

                //filter duplicates
                self.device.data = (self.device.data || []).filter(s => !samples.find(n => n.timestamp == s.timestamp));

                self.device.data = self.device.data.concat(samples);

                if(self.device.data.length) {
                    self.device.data.sort((a,b) => a.timestamp < b.timestamp ? -1 : 1);
                    self.device.lastTimestamp = self.device.data[self.device.data.length - 1].timestamp;
                }

                self.storeData();

                return self.updateDashboard();
            }).catch(e => {
                app.showError(e);
            }).finally(_ => {
                app.hideStatus();
            });
        },

        getActivityData(since) {
            var self = this;

            return new Promise((resolve, reject) => {                  

                let samples = [];

                ble.setCharacteristicNotification(self.DATA_RESP_CHARACTERISTIC, true).then(_ => {

                    return ble.writeCharacteristic(self.DATA_REQ_CHARACTERISTIC, Math.round(since / 1000).toString(16));
                }).then(result => {
                    return ble.listenForCharacteristicChanges();
                }).then(data => {
                        return self.processActivityData(data, samples);
                }).then(_ => {
                    return ble.setCharacteristicNotification(self.DATA_RESP_CHARACTERISTIC, false);
                }).then(_ => {
                    return ble.setCharacteristicNotification(self.DATA_REQ_CHARACTERISTIC, false);
                }).then(_ => {
                    return ble.disconnect();
                }).then(_ => {
                    console.log('get activity data complete');
                    return resolve(samples);
                }).catch(e => {
                    console.log('error getting activity data', e);
                    return reject(e);
                });
            });
        },

        processActivityData: function(result, samples) {
            var self = this;

            console.log('activity data', result);

            return new Promise((resolve, reject) => {  
                
                //parse data
                if(!result || result.length < 4) {
                    return resolve();
                }

                let i = 0;
                let currentSample = parseInt(result.substr(0,4).reverse(16), 16);
                let samplesAdded = 0;

                while(currentSample > 0 && i <= (result.length - 20)) {
                    let timestamp = (parseInt(result.substr(i+4,8).reverse(16),16) * 1000);
                    let sample = {
                        id: timestamp.toHex(12),
                        timestamp: timestamp,
                        createdDate: Date.tz(timestamp).format(),
                        intensity: parseInt(result.substr(i+12,2), 16),
                        steps: parseInt(result.substr(i+14,2), 16),
                        temperature: parseInt(result.substr(i+16,2), 16),
                        category: parseInt(result.substr(i+18,2), 16)
                    };

                    if(sample.category & 0x10) {
                        //carry flag for steps
                        sample.steps += 256;
                        sample.category &= 0x0f;
                    } 

                    samples.push(sample);
                    
                    samplesAdded++;
                    i += 20;
                    if(i <= (result.length - 20)) {
                        currentSample = parseInt(result.substr(i,4).reverse(16), 16);
                    }
                }

                app.updateStatus('Added ' + samplesAdded + ' Samples. Last Index: ' + currentSample);

                //check for last record
                if(currentSample <= 1) {
                    return resolve();
                }

                return ble.listenForCharacteristicChanges().then(data => {
                    return this.processActivityData(data, samples);
                }).then(_ => {
                    return resolve();
                });            
            });
        },

        storeData: function() {
            var self = this;

            if(!window.storage) {
                return;
            }

            window.storage.setItem('wearable_data', JSON.stringify(self.deviceList || []));          
        },
    
        loadData: function() {
            var self = this;

            self.deviceList = [];

            if(!window.storage) {
                return;
            }

            try {
                var data = window.storage.getItem('wearable_data');
                if(data && data != 'undefined' && data != "[]") {
                    self.deviceList = JSON.parse(data);                    
                }

                if(self.deviceList && self.deviceList.length) {
                    self.deviceList.sort(function(a,b) { a.lastTimestamp > b.lastTimestamp ? 1 : -1 });
                    self.device = self.deviceList[0];
                }

            } catch (e) {
                console.log(e);
                self.deviceList = [];
            }
        },

        showActivity: function() {
            var self = this;

            self.metric = 'intensity';

            document.querySelectorAll('.button-selected').forEach(elem => { elem.classList.remove('button-selected'); });
            document.getElementById('activityIcon').classList.add('button-selected');

            self.updateDashboard();
        },

        showSleep: function() {
            var self = this;

            self.metric = 'sleep';

            document.querySelectorAll('.button-selected').forEach(elem => { elem.classList.remove('button-selected'); });
            document.getElementById('sleepIcon').classList.add('button-selected');

            self.updateDashboard();
        },

        showSteps: function() {
            var self = this;

            self.metric = 'steps';

            document.querySelectorAll('.button-selected').forEach(elem => { elem.classList.remove('button-selected'); });
            document.getElementById('stepsIcon').classList.add('button-selected');

            self.updateDashboard();
        },

        showTemp: function() {
            var self = this;

            self.metric = 'temperature';

            document.querySelectorAll('.button-selected').forEach(elem => { elem.classList.remove('button-selected'); });
            document.getElementById('tempIcon').classList.add('button-selected');

            self.updateDashboard();
        },

        updateDashboard: function() {
            var self = this;

            if(!self.device) {
                return;
            }

            self.startTime = Date.tz().subtract(24, 'hours');
            self.endTime = self.startTime.copy().add(1, 'day');

            self.infoHandlers = [];

            let listItem = document.getElementById('mainView').querySelector('.item-activity');
            listItem.innerHTML = '';

            listItem.style.width = (app.getScreenWidth() - 30) + 'px';

            self.updateActivityTimeline(listItem);
        },

        addChildElement: function(parent, name, attributes, html) {
            var self = this;

            var elem = document.createElement(name);
            parent.appendChild(elem);
            for(var key in attributes) {
                elem.setAttribute(key, attributes[key]);
            }

            if(html) {
                elem.innerHTML = html;
            }

            return elem;
        },

        updateActivityTimeline: function(elem) {
            var self = this;
    
            if(!elem || !elem.checkVisibility()) {
                return;
            }
            
            elem.innerHTML = '';
    
            let start = self.startTime.copy();
            let end = self.endTime.copy();

            let startFilter = start.format().substr(0,16);
            let endFilter = end.format().substr(0,16);
    
            let list = (self.device.data || []).filter(s => { return s.createdDate >= startFilter && s.createdDate <= endFilter; });

            let rangeDuration = Date.duration(start, end);
            let width = app.getScreenWidth() - 30;

            var totalMS = rangeDuration.ms;
            let startMS = start.valueOf();

            /*  draw hour bars */
            var hours = [];
            var days = [];
    
            var ts = start.copy();
            //round to the nearest hour if necessary
            if(ts.minutes() || ts.seconds()) {
                ts.add(1, 'hour').minutes(0).seconds(0).ms(0);
            }
            
            let markerFreq = Math.max(rangeDuration.asDays(), 1);
            if([5,7].includes(markerFreq)) {
                markerFreq++;
            } else if([9,10,11].includes(markerFreq)) {
                markerFreq = 12;
            } else if(markerFreq > 12) {
                markerFreq = 24;
            }

            //Create the hourly labels
            let x = Math.round(((ts.valueOf() - startMS) / totalMS) * width);

            while(ts.format() <= end.format()) {
    
                if(ts.hours() % markerFreq == 0) {
                    var label = ts.format('ha');
                    var fill = '#999';

                    if(ts.hours() == 0 && ts.format() != end.format()) {
                        let dayStart = ts.valueOf();
                        let dayEnd = dayStart + 86400000;
                        let totalSteps = 0;
                        ((list || []).filter(s => { return s.timestamp >= dayStart && s.timestamp < dayEnd; })).forEach((s) => {
                            totalSteps += s.steps || 0;
                        });
                        days.push({ x: Math.round(x), label: ts.format('ddd M/D'), timestamp: ts.valueOf(), steps: totalSteps });
                    }                
        
                    hours.push({
                        x: Math.round(x),
                        label: label,
                        fill: fill,
                        night: (ts.hour() < 6 || ts.hour() >= 21) ? true : false
                    });
                }
    
                //x += pixelsPerHour;
                ts.add(1, 'hours');
                x = Math.round(((ts.valueOf() - startMS) / totalMS) * width);
            }
    
            let bh = 290;
    
            var svg = document.createElement('svg');
            svg.setAttribute('width', width + 'px');
            svg.setAttribute('height', bh + 10 + 'px');

            hours.forEach(function(h) {
                let txtElem = document.createElement('text');
                txtElem.setAttribute('y', 30);
                txtElem.setAttribute('x', h.x);
                txtElem.setAttribute('fill', h.fill);
                txtElem.style.fontSize = '8px';
                txtElem.innerHTML = h.label;
                svg.appendChild(txtElem);
            
                if(h.night == true) {
                    self.addChildElement(svg, 'svg', { y: 30, x: h.x, fill: 'rgba(187, 187, 187, .6)', width: 20, height: 20, viewBox: '0 0 25 25'}, '<path d="M11.062 17.875q-1.437 0-2.697-.542-1.261-.541-2.209-1.489-.948-.948-1.489-2.209-.542-1.26-.542-2.697 0-2.105 1.104-3.855T8.333 4.5q.021 1.917.729 3.552.709 1.636 2.021 2.948 1.25 1.271 2.927 1.958 1.678.688 3.49.709-.812 1.937-2.573 3.073-1.76 1.135-3.865 1.135Z"/>');
                } 
            });
    
            days.forEach(function(d) {                
                self.addChildElement(svg, 'line', { x1: d.x, x2: d.x, y1: 0, y2: bh+10, style: 'stroke: rgba(187, 187, 187, .3); stroke-width: 1px;'});
                self.addChildElement(svg, 'text', { x: d.x+2, y: 13, fill: '#666', style: 'font-size: 12px'}, d.label);
            });
    
            let sleepPath = '';
            let activePath = '';
            let removedPath = '';
            let tempPath = '';
            let stepsPath = '';
            
            let sampleWidth = width / (totalMS / 60000);
            sampleWidth *= 1.25;
            let iRatio = 1;

            if(self.metric === 'temperature') {
                iRatio = 255 / 130;
                sleepHeight = bh;
            }
    
            let tempY = bh;
            let stepsY = 226;
            let sleepY = 162;
            let actY = 98;

            list.forEach(function(sample) {     
                
                if(sample[self.metric] == undefined) {
                    return;
                }
    
                let xOffset = Math.round(((+sample.timestamp - startMS) / totalMS) * width);

                let actYOffset = actY - (sample.intensity * .25);
                let sleepYOffset = sleepY - (sample.category > 1 ? (sample.category * 10) : 0);
                let stepsYOffset = stepsY - (sample.steps * .125);
                let tempYOffset = tempY - (sample.temperature * .5);

                activePath += ((activePath ? '' : ('M' + xOffset + ' ' + actY)) + 'L' + xOffset + ' ' + actYOffset);
                sleepPath += ((sleepPath ? '' : ('M' + xOffset + ' ' + sleepY)) + 'L' + xOffset + ' ' + sleepYOffset);
                stepsPath += ((stepsPath ? '' : ('M' + xOffset + ' ' + stepsY)) + 'L' + xOffset + ' ' + stepsYOffset);
                tempPath += ((tempPath ? '' : ('M' + xOffset + ' ' + tempY)) + 'L' + xOffset + ' ' + tempYOffset);

                if(sample.category == 0) {
                    self.addChildElement(svg, 'line', { x1: xOffset, x2: xOffset + sampleWidth, y1: actY, y2: actY + 5, style: 'stroke: rgba(139,0,0,0.5); stoke-width: ' + sampleWidth + 'px; fill: rgba(139,0,0,0.5);'});
                    self.addChildElement(svg, 'line', { x1: xOffset, x2: xOffset + sampleWidth, y1: sleepY, y2: sleepY + 5, style: 'stroke: rgba(139,0,0,0.5); stoke-width: ' + sampleWidth + 'px; fill: rgba(139,0,0,0.5);'});
                    self.addChildElement(svg, 'line', { x1: xOffset, x2: xOffset + sampleWidth, y1: stepsY, y2: stepsY + 5, style: 'stroke: rgba(139,0,0,0.5); stoke-width: ' + sampleWidth + 'px; fill: rgba(139,0,0,0.5);'});
                    self.addChildElement(svg, 'line', { x1: xOffset, x2: xOffset + sampleWidth, y1: tempY, y2: tempY + 5, style: 'stroke: rgba(139,0,0,0.5); stoke-width: ' + sampleWidth + 'px; fill: rgba(139,0,0,0.5);'});
                } 
            });
         
            sleepPath += 'V ' + sleepY;
            self.addChildElement(svg, 'path', { id: 'sleep_path', style: 'stroke: rgba(187, 187, 187, .6); fill: rgba(187, 187, 187, .4);', d: sleepPath });
            sleepPath = '';

            activePath += 'V ' + actY;
            self.addChildElement(svg, 'path', {style: 'stroke: rgba(0,132,255,0.4); stoke-width: 2px; fill: rgba(0,132,255,0.2);', d: activePath });
            activePath = '';

            stepsPath += 'V ' + stepsY;
            self.addChildElement(svg, 'path', {style: 'stroke: rgba(5,122,48,0.4); stoke-width: 2px; fill: rgba(5,122,48,0.2);', d: stepsPath });
            stepsPath = '';

            tempPath += 'V ' + tempY;
            self.addChildElement(svg, 'path', {style: 'stroke: rgba(255,140,0,0.4); stoke-width: 2px; fill: rgba(255,140,0,0.2);', d: tempPath });
            tempPath = '';
            
     
            //create the cursor bar
            let cursor = self.addChildElement(svg, 'line', { class: 'cursor', x1: 0, x2: 0, y1: 0, y2: bh+10, style: 'stroke: rgba(187, 187, 187, .3); stroke-width: 1px;'});
            //let cursor  = svg.child('line').attr('class', 'cursor').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', bh + 10).attr('style', 'stroke: rgba(187, 187, 187, .3); stroke-width: 1px;');
            cursor.style.visibility = 'hidden';

            let cursorInfo = self.addChildElement(svg, 'svg', { class: 'cursorInfo', width: '80', height: '62', y: '34', style: 'visibility: hidden'});

            self.addChildElement(cursorInfo, 'rect', { width: '78', height: '62', rx: '8', x: '2', y: '0', fill: 'rgba(187, 171, 244, .9)' });
            self.addChildElement(cursorInfo, 'text', { class: 'cursorTime', x: '10', y: '14', fill: '#666', style: 'font-size: 10px' });
            self.addChildElement(cursorInfo, 'text', { x: '34', y: '28', fill: '#666', style: 'font-size: 10px; font-style: italic;' }, 'Intensity');
            self.addChildElement(cursorInfo, 'text', { class: 'cursorIntensity', x: '11', y: '28', fill: '#666', style: 'font-size: 10px; font-weight: bold;' });
            self.addChildElement(cursorInfo, 'text', {  x: '34', y: '42', fill: '#666', style: 'font-size: 10px;  font-style: italic;' }, 'Steps');
            self.addChildElement(cursorInfo, 'text', { class: 'cursorSteps', x: '11', y: '42', fill: '#666', style: 'font-size: 10px; font-weight: bold;' });
            self.addChildElement(cursorInfo, 'text', { class: 'cursorTemp', x: '11', y: '56', fill: '#666', style: 'font-size: 10px; font-weight: bold;' });

            elem.innerHTML = (svg.outerHTML);
    
            elem.scrollLeft = width - elem.offsetWidth;

            let cursorTimeOut = 0;
            var moveHandler = function(offsetX) {

                let cursor = elem.querySelector('line.cursor');
                let cursorInfo = elem.querySelector('svg.cursorInfo');
        
                if(!cursor || !cursorInfo) {
                    return;
                }

                cursor.setAttribute('x1', offsetX);
                cursor.setAttribute('x2', offsetX);
                cursor.style.visibility = 'visible';

                let offset = Math.round(offsetX * (1440 / width));
                let cursorTime = self.startTime.copy().add(offset, 'minutes');
                let ms = cursorTime.valueOf();
                let sample = undefined;
                let tdiff = 120000; //totalMS;

                //find the nearest point
                list.forEach((obj) => { 
                    if(Math.abs(ms - obj.timestamp) < tdiff) {
                        sample = obj;
                        tdiff = Math.abs(ms - obj.timestamp);
                    }
                });

                if(sample) {
                    let xOffset = Math.round(((+sample.timestamp - startMS) / totalMS) * width);

                    if(xOffset < (width - 100)) {
                        cursorInfo.setAttribute('x', xOffset);
                    } else {
                        cursorInfo.setAttribute('x', xOffset - 80);
                    }
                    cursorInfo.querySelector('.cursorTime').innerHTML = (cursorTime.format('h:mma'));
                    cursorInfo.querySelector('.cursorIntensity').innerHTML = (sample.intensity);
                    cursorInfo.querySelector('.cursorSteps').innerHTML = (sample.steps);
                    if(sample.temperature) {
                        cursorInfo.querySelector('.cursorTemp').innerHTML = (sample.temperature + '&degF');
                    }
                    cursorInfo.style.visibility = 'visible';
                } else {
                    return;
                }

                clearTimeout(cursorTimeOut);
                cursorTimeOut = setTimeout(() => { cursor.style.visibility = 'hidden';  cursorInfo.style.visibility = 'hidden'; }, 5000);
            };

            self.infoHandlers.push(moveHandler);

            elem.querySelector('svg').onmousemove = function(event) {
                if(event.offsetX) {
                    self.infoHandler(event.offsetX);
                }
            };
        },

        infoHandler: function(xOffset) {
            var self = this;

            self.infoHandlers.forEach(fn => fn.call(this, xOffset));
        }
    };
})();