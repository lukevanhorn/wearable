/* uuid generator */
globalThis.uuidv4 = function() {
    var c;
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, function () { return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16); });
}

//global offset to match server time
Date.clockOffset = 0;

/* 
*  Date with timezone constructor 
*  timestamp: Compatible datetime string or milliseconds since 1970. Default is now
*  timezone: Timezone to be used for formatting and comparison operations. Defaults is globalThis.timezone or the local default
*
*  Examples: 
*  Date.tz('2021-05-16T20:01:00-05:00', 'US/Pacific') == 2021-05-16T18:01:00-07:00
*  Date.tz(1615712400000, 'US/Pacific') 
*/
Date.tz = function(timestamp, timezone) {

    //check for numeric string
    if(Number.isNaN(timestamp) && Number.isInteger(timestamp)) {
        timestamp = +timestamp;
    }

    //only timezone passed in
    if(timestamp && !timezone && Number.isNaN(new Date(timestamp).valueOf())) { 
        timezone = timestamp;
        timestamp = undefined;
    }

    let now = timestamp ? new Date(timestamp) : new Date();
    if(!timestamp) {
        now.add(Date.clockOffset || 0, 'ms');
    }

    now.timezone = timezone || globalThis.timezone || (globalThis.facility ? globalThis.facility.timezone : undefined);

    return now;
}

//holds the timezone setting 
if(!Date.timezone) { 
    Object.defineProperty(Date, 'timezone', { value: undefined, writable: true });
}

Date.prototype.getTimezone = function() {
    this.timezone = this.timezone || globalThis.timezone || (globalThis.facility ? globalThis.facility.timezone : undefined);

    let tzFixes = {'US/Pacific': 'America/Los_Angeles', 'US/Mountain': 'America/Denver', 'US/Arizona': 'America/Phoenix', 'US/Central': 'America/Chicago', 'US/Eastern': 'America/New_York'};
    return tzFixes[this.timezone] || this.timezone;
}

//intl formatter for date parts
if(!Date.longFormatter) { 
    Object.defineProperty(Intl.DateTimeFormat, 'longFormatter', { value: undefined, writable: true });
}

//intl formatter for date parts - short
if(!Date.shortFormatter) { 
    Object.defineProperty(Intl.DateTimeFormat, 'shortFormatter', { value: undefined, writable: true });
}

/* 
* getParts  
* returns object of date components in string representation
* timezone used is the one passed into Date.tz constructor, globalThis.timezone, or the local default
*/
Date.prototype.getParts = function() {
    let dateParts = {};

    if(!this.longFormatter) {
        this.longFormatter = new Intl.DateTimeFormat('en-GB', { weekday: 'long',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            timeZone: this.getTimezone(), timeZoneName: 'short', hourCycle: 'h23'
        });
        this.shortFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: this.getTimezone(), month: 'long' });
    }

    //get the date parts
    this.longFormatter.formatToParts(this).reduce(function(acc, p) { 
        if(p.type !== 'literal') { 
            acc[p.type] = p.value; 
        } 
        return acc; 
    }, dateParts);

    //add in the full month name
   this.shortFormatter.formatToParts(this).reduce(function(acc, p) { 
        acc.monthLong = p.value; 
    }, dateParts);

    return dateParts;
}

/*
*  Returns string output based on formatter string
*  Default is YYYY-MM-DDTHH:MM:SS-HH:MM
*  Options: 
*  YYYY - Full year
*  YY   - 2-digit year
*  MMMM - Month (full)
*  MMM  - Month (abv)
*  MM   - Month 2-digit
*  M    - Month 
*  dddd - Weekday (full)
*  ddd  - Weekday (abv)
*  DD   - 2 digit date
*  D    - date
*  HH   - hour (24h) 2-digit 
*  H    - hour (24h)
*  hh   - hour (12h) 2-digit
*  h    - hour (12h)
*  mm   - minute 2-digit
*  m    - minute
*  ss   - second 2-digit
*  s    - second
*  aa   - day period (am or pm)
*  a    - day period (a or p)
*/
Date.prototype.format = function(display) {

    let dateParts = this.getParts();

    if(!display) {
        return dateParts.year + '-' + dateParts.month + '-' + dateParts.day +
        'T' + dateParts.hour + ':' + dateParts.minute + ':' + dateParts.second + 
        (dateParts.timeZoneName == 'UTC' ? 'Z' : (dateParts.timeZoneName.substr(3,1) + (dateParts.timeZoneName.substr(4).padStart(2,'0').padEnd(4,'0')).match(/\d{2,2}/g).join(':')));
    }

    display = display.replace(/YYYY/g, dateParts.year)
            .replace(/YY/g, dateParts.year.substr(2))
            .replace(/DD/g, dateParts.day)
            .replace(/D/g, +dateParts.day)
            .replace(/HH/g, dateParts.hour)
            .replace(/H/g, +dateParts.hour)
            .replace(/mm/g, dateParts.minute)
            .replace(/m/g, +dateParts.minute)
            .replace(/hh/g, (+dateParts.hour % 12 || 12).toString().padStart(2,'0'))
            .replace(/h/g, +dateParts.hour % 12 || 12)
            .replace(/ss/g, dateParts.second)
            .replace(/s/g, +dateParts.second)
            .replace(/aa/g, +dateParts.hour < 12 ? 'am' : 'pm')
            .replace(/a/g, +dateParts.hour < 12 ? 'a' : 'p')
            .replace(/MMMM/g, dateParts.monthLong)
            .replace(/MMM/g, dateParts.monthLong.substr(0,3))
            .replace(/MM/g, dateParts.month)
            .replace(/M(?![a-zA-Z])/g, +dateParts.month)
            .replace(/dddd/g, dateParts.weekday)
            .replace(/ddd/g, dateParts.weekday.substr(0,3));

    return display;
}

Date.prototype.isLeap = function(y) {
    y = y || this.getFullYear();

    if(y % 100 == 0) {
        return y % 400 == 0;
    }

    return y % 4 == 0;
}

Date.prototype.getMonthDays = function(offset) {
    let y = this.getFullYear();
    let m = this.getMonth();
    m += offset || 0;
    if(m < 0) {
        m = 11;
    } else if(m > 11) {
        m = 0;
    }
    if(this.isLeap(y)) {
        return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];
    } else {
        return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];
    }
}

Date.prototype.getYearDays = function(offset) {
    let y = this.getFullYear();
    if(offset > 0) {
        y += offset;
    }
    if(this.isLeap(y)) {
        return 366;
    } else {
        return 365;
    }
}

//get or set the 4 digit year
Date.prototype.year =
Date.prototype.years = function(val) {
    let y = Number.parseInt(this.getParts().year);
    if(val === undefined) {
        return y;
    }
    return this.add(val - y, 'years');
}

//gets or set the month [0 - 11]
Date.prototype.month =
Date.prototype.months = function(val) {
    let m = +this.getParts().month - 1;
    if(val === undefined) {
        return m;
    }
    if(val < 0 || val > 11) {
        return this;
    }

    return this.add(val - m, 'months');
}

//gets the week of the year [1 - 52]
Date.prototype.week = function() {
    var temp = Date.tz(this.valueOf(), this.timezone);
    temp.month(0).date(0).hours(0).minutes(0).seconds(0);
    var day = temp.day();
    var wk = 0;

    var ms = this.valueOf() - temp.valueOf();
    if(day > 0) {
        ms -= (day * 86400000);
        wk++;
    }
    wk += Math.round(ms/604800000);

    return wk;
}

//get the day of the year
Date.prototype.dayOfYear = function() {
    var temp = Date.tz(this.valueOf(), this.timezone);
    let days = temp.date();
    while(temp.month() > 0) {
        days += temp.getMonthDays(-1);
        temp.add(-1, 'month');
    }

    return days;
}

//get or set the day of the month
Date.prototype.date = function(val) {
    let d = Number.parseInt(this.getParts().day);
    if(val === undefined) {
        return d;
    }
    return this.add(val - d, 'days');
}

//returns the numeric day of the week [0-6]
Date.prototype.day = function() {
    return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(this.getParts().weekday);
}

//gets or sets the hour [0 - 23]
Date.prototype.hour = 
Date.prototype.hours = function(val) {
    let h = Number.parseInt(this.getParts().hour);

    if(val === undefined) {
        return h;
    }

    if(val == h) {
        return this;
    }

    let dir = val > h ? 1 : -1;

    while(h != val) {
        this.add(dir, 'hours');
        h = Number.parseInt(this.getParts().hour);
    }

    return this;
}

//gets or sets the minute [0 - 59]
Date.prototype.minute = 
Date.prototype.minutes = function(val) {
    if(val === undefined) {
        return this.getMinutes();
    }

    this.setMinutes(val);
    return this;
}

//gets or sets the second [0 - 59]
Date.prototype.second = 
Date.prototype.seconds = function(val) {
    if(val === undefined) {
        return this.getSeconds();
    }
    this.setSeconds(val);
    return this;
}

//gets or sets the millisecond [0 - 999]
Date.prototype.ms =
Date.prototype.millisecond = 
Date.prototype.milliseconds = function(val) {
    if(val === undefined) {
        return this.getMilliseconds();
    }
    this.setMilliseconds(val);
    return this;
}

/* 
* add - function for adjusting the date/time
* count: numeric amount to adjust. positive or negative value (required)
* unit:  string to specify period (required)
*
* unit options:
* ms/millisecond(s)
* second(s) 
* minute(s)
* hour(s)
* day(s)
* week(s)
* month(s)
* year(s)
* 
* value may be positive or negative and may be outside of the normal get/set range
* example:
* (100, 'seconds')
* (-10, 'minutes')
* (10, 'months')
* (1, 'day')
*/
Date.prototype.add = function(count, unit) {
    
    //get first three letters of unit
    unit = unit.toLowerCase().trim().substr(0,3);

    count = Math.round(count) || 0;

    if(unit === 'ms' || unit === 'mil') {
        this.setTime(this.valueOf() + count);
    } else if(unit === 'sec') {
        this.setTime(this.valueOf() + (count * 1000));
    } else if(unit === 'min') {
        this.setTime(this.valueOf() + (count * 60 * 1000));
    } else if(unit === 'hou') {
        this.setTime(this.valueOf() + (count * 3600 * 1000));
    } else if(unit === 'day') {
        this.setTime(this.valueOf() + (count * 3600 * 1000 * 24));        
    } else if(unit === 'wee') {
        this.setTime(this.valueOf() + (count * 604800 * 1000));
    } else if(unit === 'mon') {

        let dir = count < 0 ? -1 : 1;

        let targetDate = this.date();

        while(count != 0) {
            let mDays = this.getMonthDays(dir);
            if(dir < 0) {
                mDays = this.date() + (mDays - Math.min(targetDate, mDays));
            } else {
                mDays = (this.getMonthDays() - this.date()) + (Math.min(targetDate, mDays));
            } 

            this.setTime(this.valueOf() + (dir * 3600 * 1000 * 24 * mDays));  
            count -= dir;
        }  
    } else if(unit === 'yea') {
        let dir = count < 0 ? -1 : 1;

        while(count != 0) {
            this.setTime(this.valueOf() + (dir * 3600 * 1000 * 24 * this.getYearDays(dir)));
            count -= dir;
        }  
    }

    return this;
}

//convenience function to call add with a negative value
Date.prototype.subtract = function(count, unit) {
    return this.add(count * -1, unit);
}

//set time portion of date
//minute and seconds are optional
//H:mm:ss
Date.prototype.parseTime = function(time) {
    let parts = time.toString().split(':');
    if(parts[0] && Number.isInteger(+parts[0])) {
        this.hour(+parts[0]);
    }
    if(parts[1] && Number.isInteger(+parts[1])) {
        this.minutes(+parts[1]);
    } else {
        this.minutes(0);
    }
    if(parts[2] && Number.isInteger(+parts[2])) {
        this.seconds(+parts[2]);
    } else {
        this.seconds(0);
    }
    this.ms(0);

    return this;
}

/*
*  Date.duration(t1, t2)
*  Static function to calculate the time between two dates
*  returns an object with utility functions to format the value
*  t1:  Date object or quantity 
*  t2:  Date object or string unit
*  if t1 is a date object and t2 is not supplied, now is used for t2
*  
*  functions: 
*  asSeconds(), asMinutes(), asHours(), asDays(), asWeeks, asMonths, asYears
*  humanize(), humanizeAbv()

* examples:  
* Date.duration(Date.tz('2020-01-01T00:00:00Z')).asDays()     // 502 days from now (5/16/2021)
* Date.duration(20, 'hours').asMinutes()                      // 1200 
* Date.duration(Date.tz().subtract(43, 'days')).asWeeks()     // 6
* Date.duration(Date.tz().subtract(43, 'days')).humanize()    // 1 month
* Date.duration(Date.tz().subtract(43, 'days')).humanizeAbv() // 1 mo
*/
Date.duration = function(t1, t2) {
    if(t1 == undefined) {
        return;
    }

    let allowNegative = false;

    var ms = 0;
    if(typeof t1 === 'number') {
        ms = Math.abs(t1);
    } else if(typeof t1 === 'string' && !isNaN(Date.parse(t1))) {
        ms = Date.tz(t1).valueOf();
    } else if(t1.valueOf) {        
        ms = t1.valueOf();
    } 

    //subtract from now if not a second date
    if(ms > 10000000000 && !t2) {
        allowNegative = true;
        t2 = Date.tz().valueOf();
    }
    if(t2) {
        if(typeof t2 === 'string' && isNaN(Date.parse(t2))) {
            if(t2 === 'minutes') {
                ms *= 60000;
            } else if(t2 === 'hours') {
                ms *= 3600000;
            } else if(t2 === 'days') {
                ms *= 86400000;
            } else if(t2 === 'weeks') {
                ms *= 604800000;
            } else if(t2 === 'months') {
                ms *= 2592000000;
            } else if(t2 === 'years') {
                ms *= 31536000000;
            } else {
                return; 
            }
        } else if(typeof t2 === 'number') {
            ms = t2 - ms;
        } else if(t2.valueOf) {
            ms = t2.valueOf() - ms;
        }

        if(!allowNegative) {
            ms = Math.abs(ms);
        }
    }

    var obj = {
        ms: ms,

        asSeconds: function() {
            return Math.floor(this.ms/1000);
        },
        seconds: function() { return this.asSeconds(); },

        asMinutes: function() {
            return Math.floor(this.ms/60000);
        },
        minutes: function() {  return this.asMinutes(); },

        asHours: function() {
            return Math.floor(this.ms/3600000);
        },
        minutes: function() {  return this.asMinutes(); },

        asDays: function() {
            return Math.floor(this.ms/86400000);
        }, 
        days: function() {  return this.asDays(); },

        asWeeks: function() {
            return Math.floor(this.ms/604800000);
        }, 
        weeks: function() {  return this.asWeeks(); },

        asMonths: function() {
            return Math.floor(this.ms/2592000000);
        },
        months: function() {  return this.asMonths(); },

        asYears: function() {
            return Math.floor(this.ms/31536000000);
        },
        years: function() {  return this.asYears(); },
        
        humanize: function() {
            var val = '';

            if(this.asYears()) {
                return this.asYears() + ' year' + (Math.abs(this.asYears()) > 1 ? 's' : '') + (this.ms < 0 ? ' ago' : '');
            } 
            if(this.asMonths()) {
                return this.asMonths() + ' month' + (Math.abs(this.asMonths()) > 1 ? 's' : '') + (this.ms < 0 ? ' ago' : '');
            }
            if(this.asWeeks()) {
                return this.asWeeks() + ' week' + (Math.abs(this.asWeeks()) > 1 ? 's' : '') + (this.ms < 0 ? ' ago' : '');
            }
            if(this.asDays()) {
                return this.asDays() + ' day' + (Math.abs(this.asDays()) > 1 ? 's' : '') + (this.ms < 0 ? ' ago' : '');
            }
            if(this.asHours()) {
                return this.asHours() + ' hour' + (Math.abs(this.asHours()) > 1 ? 's' : '') + (this.ms < 0 ? ' ago' : '');
            }
            if(this.asMinutes()) {
                return this.asMinutes() + ' minute' + (Math.abs(this.asMinutes()) > 1 ? 's' : '') + (this.ms < 0 ? ' ago' : '');
            }
            if(this.asSeconds()) {
                return this.asSeconds() + ' second' + (Math.abs(this.asSeconds()) > 1 ? 's' : '') + (this.ms < 0 ? ' ago' : '');
            }

            return 'now';
        },

        humanizeAbv: function(minRes, padding) {
            minRes = minRes || 's';
            padding = isNaN(+padding) ? 1 : +padding;

            var val = '';

            if(this.asYears() || minRes === 'y') {
                return this.asYears() + 'y'.padStart(padding + 1, ' ');
            } 
            if(this.asMonths() || minRes === 'mo') {
                return this.asMonths() + 'mo'.padStart(padding + 2, ' ');
            }
            if(this.asWeeks() || minRes === 'w') {
                return this.asWeeks() + 'w'.padStart(padding + 1, ' ');
            }
            if(this.asDays() || minRes === 'd') {
                return this.asDays() + 'd'.padStart(padding + 1, ' ');
            }
            if(this.asHours() || minRes === 'h') {
                return this.asHours() + 'h'.padStart(padding + 1, ' ');
            }
            if(this.asMinutes() || minRes === 'm') {
                return this.asMinutes() + 'm'.padStart(padding + 1, ' ');
            }
            if(this.asSeconds()) {
                return this.asSeconds() + 's'.padStart(padding + 1, ' ');
            }

            return 'now';
        }, 
        
        format: function() {
            return this.asDays() + 'd ' + (this.asHours() % 24).toString().padStart(2,'0') + 'h ' + (this.asMinutes() % 60).toString().padStart(2,'0') + 'm ' + (this.asSeconds() % 60).toString().padStart(2,'0') + 's';
        }
    }

    return obj;
}

//utility function to clone a date object
Date.prototype.copy = function() { 
    return Date.tz(this, this.timezone); 
}

//compares this date to current date in timezone
Date.prototype.isToday = function() { 
    return this.format('YYYY-MM-DD') === Date.tz(this.timezone).format('YYYY-MM-DD'); 
}

//utility function to set the time to the beginning of a day 00:00:00
Date.prototype.resetDay = function() {

    return this.hours(0).minutes(0).seconds(0).milliseconds(0);
}

Date.prototype.toString = function() {
    return this.format();
}

Date.utc = function() {
    var now = Date.tz('UTC');

    return now;
}

String.prototype.reverse = function(base) {
    var inc = 1;
    if(base == 16) {
        inc = 2;
    }
    var newVal = '';
    for(var i = 0; i < (this.length - 1); i += inc) {
        newVal += this.substr((this.length - (i + inc)),inc);
    }

    return newVal;
}

String.prototype.toJSON = function() {
    try {
        return JSON.parse(this);
    } catch(e) {
        return null;
    };
}

String.prototype.toInt = function() {
    let val = 0;
    for(let i = 0; i < this.length; i++) {
        if(isNaN(Number.parseInt(this[i]))) {
            break;
        }
        val *= 10;
        val += Number.parseInt(this[i]);
    }

    return val;
}

String.prototype.toHexString = function() {

    var hex = '';

    for(var i = 0; i < this.length; i++) {
        var c = '00' + this.charCodeAt(i).toString(16);
        hex += c.substr(c.length - 2);
    }
    
    return hex;
};

String.prototype.toUnicodeHexString = function() {

    var hex = '';

    let encoder = new TextEncoder('utf-8');
    var arr = encoder.encode(this);
    for(var i = 0; i < arr.length; i++) {
        var c = '00' + arr[i].toString(16);
        hex += c.substr(c.length - 2);
    }

    return hex;
};

String.prototype.toUint8Array = function() {
    var bytes = new Uint8Array(Math.ceil(this.length / 2));
    for (var i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(this.substring(i * 2, (i * 2) + 2), 16);
    }

    return bytes;
}

Number.prototype.toHex = function(len) {
    var hex = '';
    if(this >= 0) {
        hex = this.toString(16).toUpperCase();
        return hex.padStart(len || (Math.ceil(hex.length / 2) * 2), '0');
    } else {
        var cpy = this;
        while(Math.abs(cpy) > 0) {
            hex = ((cpy & 0xFF).toString(16).padStart(2,'0').toUpperCase() + hex);
            cpy = (cpy >> 8);
            if(cpy === -1) {
                return hex.padStart(len || (Math.ceil(hex.length / 8) * 8),'F'); 
            }            
        }
    }
}

Uint8Array.prototype.toHexString = function() {
    let hex = '';
    this.forEach(n => { hex += n.toHex(2); });

    return hex;
}

Array.prototype.has = function (id) {
    return (this.indexOf(id) > -1);
}    

Array.prototype.getId = function (id, field) {
    if(field) {
        return this.findById(id, field);
    }
    
    var obj;
    if(!id) {
        return obj;
    }

    this.forEach(function(i){
        if(i && i.id && i.id.toString() === id.toString()) {
            obj = i;
        }
    });
    return obj;
} 

Array.prototype.findById = function (id, field) {
    field = field || 'id';
    if (!id) {
        return undefined; 
    }

    for (var i = 0, len = this.length; i < len; i++){
        if (this[i] && this[i][field] && this[i][field].toString() === id.toString()){
            return this[i]; 
        }
    }
    return undefined; 
}; 

Array.prototype.findIndexById = function (id, field) {
    field = field || 'id';
    if (!id) {
        return -1; 
    }

    for (var i = 0, len = this.length; i < len; i++){
        if (this[i] && this[i][field] && this[i][field].toString() === id.toString()) {
            return i;
        }
    }
    return -1; 
}; 

Array.prototype.findByFilter = function (obj) {
    if(!obj || typeof obj !== 'object') {
        return undefined;
    }

    for (var i = 0, len = this.length; i < len; i++){
        var match = true;
        for(var field in obj) {
            if (!this[i] || !this[i][field] || this[i][field].toString() !== obj[field].toString()){
                match = false;
            }
        }
        if(match) {
            return this[i];
        } 
    }

    return undefined; 
}; 

Boolean.getValid = function() {
    for(let i = 0; i < arguments.length; i++) {
        if(Boolean.isBool(arguments[i])) return Boolean.parse(arguments[i]);
    }
    //return Boolean.isBool(val1) ? Boolean.parse(val1) : (Boolean.isBool(val2) ? Boolean.parse(val2) : undefined);
}

Boolean.isBool = function(val) {
    return typeof Boolean.parse(val) === 'boolean';
}

Boolean.parse = function(val) {
    if(val === undefined || val === null || val === '') { return undefined; }
    if(typeof val === 'boolean') { return val; }
    if(typeof val === 'string') { return (['true', '1', 'yes', 'on'].includes(val.toLocaleLowerCase()) ? true : (['false', '0', 'no', 'off'].includes(val.toLocaleLowerCase()) ? false : undefined)); }
    if(typeof val === 'number') { return (val == 1 ? true : (val == 0 ? false : undefined)); }
}

JSON.copy = function(obj) {
    if(!obj || typeof obj === 'string') {
        return obj;
    }
    return JSON.parse(JSON.stringify(obj));
}

globalThis.copy = function(obj) {
    if(!obj || typeof obj === 'string') {
        return obj;
    }
    return JSON.parse(JSON.stringify(obj));
}

/*
CryptoJS v3.1.2
code.google.com/p/crypto-js
(c) 2009-2013 by Jeff Mott. All rights reserved.
code.google.com/p/crypto-js/wiki/License
*/
var CryptoJS=CryptoJS||function(h,s){var f={},g=f.lib={},q=function(){},m=g.Base={extend:function(a){q.prototype=this;var c=new q;a&&c.mixIn(a);c.hasOwnProperty("init")||(c.init=function(){c.$super.init.apply(this,arguments)});c.init.prototype=c;c.$super=this;return c},create:function(){var a=this.extend();a.init.apply(a,arguments);return a},init:function(){},mixIn:function(a){for(var c in a)a.hasOwnProperty(c)&&(this[c]=a[c]);a.hasOwnProperty("toString")&&(this.toString=a.toString)},clone:function(){return this.init.prototype.extend(this)}},
r=g.WordArray=m.extend({init:function(a,c){a=this.words=a||[];this.sigBytes=c!=s?c:4*a.length},toString:function(a){return(a||k).stringify(this)},concat:function(a){var c=this.words,d=a.words,b=this.sigBytes;a=a.sigBytes;this.clamp();if(b%4)for(var e=0;e<a;e++)c[b+e>>>2]|=(d[e>>>2]>>>24-8*(e%4)&255)<<24-8*((b+e)%4);else if(65535<d.length)for(e=0;e<a;e+=4)c[b+e>>>2]=d[e>>>2];else c.push.apply(c,d);this.sigBytes+=a;return this},clamp:function(){var a=this.words,c=this.sigBytes;a[c>>>2]&=4294967295<<
32-8*(c%4);a.length=h.ceil(c/4)},clone:function(){var a=m.clone.call(this);a.words=this.words.slice(0);return a},random:function(a){for(var c=[],d=0;d<a;d+=4)c.push(4294967296*h.random()|0);return new r.init(c,a)}}),l=f.enc={},k=l.Hex={stringify:function(a){var c=a.words;a=a.sigBytes;for(var d=[],b=0;b<a;b++){var e=c[b>>>2]>>>24-8*(b%4)&255;d.push((e>>>4).toString(16));d.push((e&15).toString(16))}return d.join("")},parse:function(a){for(var c=a.length,d=[],b=0;b<c;b+=2)d[b>>>3]|=parseInt(a.substr(b,
2),16)<<24-4*(b%8);return new r.init(d,c/2)}},n=l.Latin1={stringify:function(a){var c=a.words;a=a.sigBytes;for(var d=[],b=0;b<a;b++)d.push(String.fromCharCode(c[b>>>2]>>>24-8*(b%4)&255));return d.join("")},parse:function(a){for(var c=a.length,d=[],b=0;b<c;b++)d[b>>>2]|=(a.charCodeAt(b)&255)<<24-8*(b%4);return new r.init(d,c)}},j=l.Utf8={stringify:function(a){try{return decodeURIComponent(escape(n.stringify(a)))}catch(c){throw Error("Malformed UTF-8 data");}},parse:function(a){return n.parse(unescape(encodeURIComponent(a)))}},
u=g.BufferedBlockAlgorithm=m.extend({reset:function(){this._data=new r.init;this._nDataBytes=0},_append:function(a){"string"==typeof a&&(a=j.parse(a));this._data.concat(a);this._nDataBytes+=a.sigBytes},_process:function(a){var c=this._data,d=c.words,b=c.sigBytes,e=this.blockSize,f=b/(4*e),f=a?h.ceil(f):h.max((f|0)-this._minBufferSize,0);a=f*e;b=h.min(4*a,b);if(a){for(var g=0;g<a;g+=e)this._doProcessBlock(d,g);g=d.splice(0,a);c.sigBytes-=b}return new r.init(g,b)},clone:function(){var a=m.clone.call(this);
a._data=this._data.clone();return a},_minBufferSize:0});g.Hasher=u.extend({cfg:m.extend(),init:function(a){this.cfg=this.cfg.extend(a);this.reset()},reset:function(){u.reset.call(this);this._doReset()},update:function(a){this._append(a);this._process();return this},finalize:function(a){a&&this._append(a);return this._doFinalize()},blockSize:16,_createHelper:function(a){return function(c,d){return(new a.init(d)).finalize(c)}},_createHmacHelper:function(a){return function(c,d){return(new t.HMAC.init(a,
d)).finalize(c)}}});var t=f.algo={};return f}(Math);
(function(h){for(var s=CryptoJS,f=s.lib,g=f.WordArray,q=f.Hasher,f=s.algo,m=[],r=[],l=function(a){return 4294967296*(a-(a|0))|0},k=2,n=0;64>n;){var j;a:{j=k;for(var u=h.sqrt(j),t=2;t<=u;t++)if(!(j%t)){j=!1;break a}j=!0}j&&(8>n&&(m[n]=l(h.pow(k,0.5))),r[n]=l(h.pow(k,1/3)),n++);k++}var a=[],f=f.SHA256=q.extend({_doReset:function(){this._hash=new g.init(m.slice(0))},_doProcessBlock:function(c,d){for(var b=this._hash.words,e=b[0],f=b[1],g=b[2],j=b[3],h=b[4],m=b[5],n=b[6],q=b[7],p=0;64>p;p++){if(16>p)a[p]=
c[d+p]|0;else{var k=a[p-15],l=a[p-2];a[p]=((k<<25|k>>>7)^(k<<14|k>>>18)^k>>>3)+a[p-7]+((l<<15|l>>>17)^(l<<13|l>>>19)^l>>>10)+a[p-16]}k=q+((h<<26|h>>>6)^(h<<21|h>>>11)^(h<<7|h>>>25))+(h&m^~h&n)+r[p]+a[p];l=((e<<30|e>>>2)^(e<<19|e>>>13)^(e<<10|e>>>22))+(e&f^e&g^f&g);q=n;n=m;m=h;h=j+k|0;j=g;g=f;f=e;e=k+l|0}b[0]=b[0]+e|0;b[1]=b[1]+f|0;b[2]=b[2]+g|0;b[3]=b[3]+j|0;b[4]=b[4]+h|0;b[5]=b[5]+m|0;b[6]=b[6]+n|0;b[7]=b[7]+q|0},_doFinalize:function(){var a=this._data,d=a.words,b=8*this._nDataBytes,e=8*a.sigBytes;
d[e>>>5]|=128<<24-e%32;d[(e+64>>>9<<4)+14]=h.floor(b/4294967296);d[(e+64>>>9<<4)+15]=b;a.sigBytes=4*d.length;this._process();return this._hash},clone:function(){var a=q.clone.call(this);a._hash=this._hash.clone();return a}});s.SHA256=q._createHelper(f);s.HmacSHA256=q._createHmacHelper(f)})(Math);
(function(){var h=CryptoJS,s=h.enc.Utf8;h.algo.HMAC=h.lib.Base.extend({init:function(f,g){f=this._hasher=new f.init;"string"==typeof g&&(g=s.parse(g));var h=f.blockSize,m=4*h;g.sigBytes>m&&(g=f.finalize(g));g.clamp();for(var r=this._oKey=g.clone(),l=this._iKey=g.clone(),k=r.words,n=l.words,j=0;j<h;j++)k[j]^=1549556828,n[j]^=909522486;r.sigBytes=l.sigBytes=m;this.reset()},reset:function(){var f=this._hasher;f.reset();f.update(this._iKey)},update:function(f){this._hasher.update(f);return this},finalize:function(f){var g=
this._hasher;f=g.finalize(f);g.reset();return g.finalize(this._oKey.clone().concat(f))}})})();

(function(){var u=CryptoJS,p=u.lib.WordArray;u.enc.Base64={stringify:function(d){var l=d.words,p=d.sigBytes,t=this._map;d.clamp();d=[];for(var r=0;r<p;r+=3)for(var w=(l[r>>>2]>>>24-8*(r%4)&255)<<16|(l[r+1>>>2]>>>24-8*((r+1)%4)&255)<<8|l[r+2>>>2]>>>24-8*((r+2)%4)&255,v=0;4>v&&r+0.75*v<p;v++)d.push(t.charAt(w>>>6*(3-v)&63));if(l=t.charAt(64))for(;d.length%4;)d.push(l);return d.join("")},parse:function(d){var l=d.length,s=this._map,t=s.charAt(64);t&&(t=d.indexOf(t),-1!=t&&(l=t));for(var t=[],r=0,w=0;w<
l;w++)if(w%4){var v=s.indexOf(d.charAt(w-1))<<2*(w%4),b=s.indexOf(d.charAt(w))>>>6-2*(w%4);t[r>>>2]|=(v|b)<<24-8*(r%4);r++}return p.create(t,r)},_map:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="}})();
(function(u){function p(b,n,a,c,e,j,k){b=b+(n&a|~n&c)+e+k;return(b<<j|b>>>32-j)+n}function d(b,n,a,c,e,j,k){b=b+(n&c|a&~c)+e+k;return(b<<j|b>>>32-j)+n}function l(b,n,a,c,e,j,k){b=b+(n^a^c)+e+k;return(b<<j|b>>>32-j)+n}function s(b,n,a,c,e,j,k){b=b+(a^(n|~c))+e+k;return(b<<j|b>>>32-j)+n}for(var t=CryptoJS,r=t.lib,w=r.WordArray,v=r.Hasher,r=t.algo,b=[],x=0;64>x;x++)b[x]=4294967296*u.abs(u.sin(x+1))|0;r=r.MD5=v.extend({_doReset:function(){this._hash=new w.init([1732584193,4023233417,2562383102,271733878])},
_doProcessBlock:function(q,n){for(var a=0;16>a;a++){var c=n+a,e=q[c];q[c]=(e<<8|e>>>24)&16711935|(e<<24|e>>>8)&4278255360}var a=this._hash.words,c=q[n+0],e=q[n+1],j=q[n+2],k=q[n+3],z=q[n+4],r=q[n+5],t=q[n+6],w=q[n+7],v=q[n+8],A=q[n+9],B=q[n+10],C=q[n+11],u=q[n+12],D=q[n+13],E=q[n+14],x=q[n+15],f=a[0],m=a[1],g=a[2],h=a[3],f=p(f,m,g,h,c,7,b[0]),h=p(h,f,m,g,e,12,b[1]),g=p(g,h,f,m,j,17,b[2]),m=p(m,g,h,f,k,22,b[3]),f=p(f,m,g,h,z,7,b[4]),h=p(h,f,m,g,r,12,b[5]),g=p(g,h,f,m,t,17,b[6]),m=p(m,g,h,f,w,22,b[7]),
f=p(f,m,g,h,v,7,b[8]),h=p(h,f,m,g,A,12,b[9]),g=p(g,h,f,m,B,17,b[10]),m=p(m,g,h,f,C,22,b[11]),f=p(f,m,g,h,u,7,b[12]),h=p(h,f,m,g,D,12,b[13]),g=p(g,h,f,m,E,17,b[14]),m=p(m,g,h,f,x,22,b[15]),f=d(f,m,g,h,e,5,b[16]),h=d(h,f,m,g,t,9,b[17]),g=d(g,h,f,m,C,14,b[18]),m=d(m,g,h,f,c,20,b[19]),f=d(f,m,g,h,r,5,b[20]),h=d(h,f,m,g,B,9,b[21]),g=d(g,h,f,m,x,14,b[22]),m=d(m,g,h,f,z,20,b[23]),f=d(f,m,g,h,A,5,b[24]),h=d(h,f,m,g,E,9,b[25]),g=d(g,h,f,m,k,14,b[26]),m=d(m,g,h,f,v,20,b[27]),f=d(f,m,g,h,D,5,b[28]),h=d(h,f,
m,g,j,9,b[29]),g=d(g,h,f,m,w,14,b[30]),m=d(m,g,h,f,u,20,b[31]),f=l(f,m,g,h,r,4,b[32]),h=l(h,f,m,g,v,11,b[33]),g=l(g,h,f,m,C,16,b[34]),m=l(m,g,h,f,E,23,b[35]),f=l(f,m,g,h,e,4,b[36]),h=l(h,f,m,g,z,11,b[37]),g=l(g,h,f,m,w,16,b[38]),m=l(m,g,h,f,B,23,b[39]),f=l(f,m,g,h,D,4,b[40]),h=l(h,f,m,g,c,11,b[41]),g=l(g,h,f,m,k,16,b[42]),m=l(m,g,h,f,t,23,b[43]),f=l(f,m,g,h,A,4,b[44]),h=l(h,f,m,g,u,11,b[45]),g=l(g,h,f,m,x,16,b[46]),m=l(m,g,h,f,j,23,b[47]),f=s(f,m,g,h,c,6,b[48]),h=s(h,f,m,g,w,10,b[49]),g=s(g,h,f,m,
E,15,b[50]),m=s(m,g,h,f,r,21,b[51]),f=s(f,m,g,h,u,6,b[52]),h=s(h,f,m,g,k,10,b[53]),g=s(g,h,f,m,B,15,b[54]),m=s(m,g,h,f,e,21,b[55]),f=s(f,m,g,h,v,6,b[56]),h=s(h,f,m,g,x,10,b[57]),g=s(g,h,f,m,t,15,b[58]),m=s(m,g,h,f,D,21,b[59]),f=s(f,m,g,h,z,6,b[60]),h=s(h,f,m,g,C,10,b[61]),g=s(g,h,f,m,j,15,b[62]),m=s(m,g,h,f,A,21,b[63]);a[0]=a[0]+f|0;a[1]=a[1]+m|0;a[2]=a[2]+g|0;a[3]=a[3]+h|0},_doFinalize:function(){var b=this._data,n=b.words,a=8*this._nDataBytes,c=8*b.sigBytes;n[c>>>5]|=128<<24-c%32;var e=u.floor(a/
4294967296);n[(c+64>>>9<<4)+15]=(e<<8|e>>>24)&16711935|(e<<24|e>>>8)&4278255360;n[(c+64>>>9<<4)+14]=(a<<8|a>>>24)&16711935|(a<<24|a>>>8)&4278255360;b.sigBytes=4*(n.length+1);this._process();b=this._hash;n=b.words;for(a=0;4>a;a++)c=n[a],n[a]=(c<<8|c>>>24)&16711935|(c<<24|c>>>8)&4278255360;return b},clone:function(){var b=v.clone.call(this);b._hash=this._hash.clone();return b}});t.MD5=v._createHelper(r);t.HmacMD5=v._createHmacHelper(r)})(Math);
(function(){var u=CryptoJS,p=u.lib,d=p.Base,l=p.WordArray,p=u.algo,s=p.EvpKDF=d.extend({cfg:d.extend({keySize:4,hasher:p.MD5,iterations:1}),init:function(d){this.cfg=this.cfg.extend(d)},compute:function(d,r){for(var p=this.cfg,s=p.hasher.create(),b=l.create(),u=b.words,q=p.keySize,p=p.iterations;u.length<q;){n&&s.update(n);var n=s.update(d).finalize(r);s.reset();for(var a=1;a<p;a++)n=s.finalize(n),s.reset();b.concat(n)}b.sigBytes=4*q;return b}});u.EvpKDF=function(d,l,p){return s.create(p).compute(d,
l)}})();
CryptoJS.lib.Cipher||function(u){var p=CryptoJS,d=p.lib,l=d.Base,s=d.WordArray,t=d.BufferedBlockAlgorithm,r=p.enc.Base64,w=p.algo.EvpKDF,v=d.Cipher=t.extend({cfg:l.extend(),createEncryptor:function(e,a){return this.create(this._ENC_XFORM_MODE,e,a)},createDecryptor:function(e,a){return this.create(this._DEC_XFORM_MODE,e,a)},init:function(e,a,b){this.cfg=this.cfg.extend(b);this._xformMode=e;this._key=a;this.reset()},reset:function(){t.reset.call(this);this._doReset()},process:function(e){this._append(e);return this._process()},
finalize:function(e){e&&this._append(e);return this._doFinalize()},keySize:4,ivSize:4,_ENC_XFORM_MODE:1,_DEC_XFORM_MODE:2,_createHelper:function(e){return{encrypt:function(b,k,d){return("string"==typeof k?c:a).encrypt(e,b,k,d)},decrypt:function(b,k,d){return("string"==typeof k?c:a).decrypt(e,b,k,d)}}}});d.StreamCipher=v.extend({_doFinalize:function(){return this._process(!0)},blockSize:1});var b=p.mode={},x=function(e,a,b){var c=this._iv;c?this._iv=u:c=this._prevBlock;for(var d=0;d<b;d++)e[a+d]^=
c[d]},q=(d.BlockCipherMode=l.extend({createEncryptor:function(e,a){return this.Encryptor.create(e,a)},createDecryptor:function(e,a){return this.Decryptor.create(e,a)},init:function(e,a){this._cipher=e;this._iv=a}})).extend();q.Encryptor=q.extend({processBlock:function(e,a){var b=this._cipher,c=b.blockSize;x.call(this,e,a,c);b.encryptBlock(e,a);this._prevBlock=e.slice(a,a+c)}});q.Decryptor=q.extend({processBlock:function(e,a){var b=this._cipher,c=b.blockSize,d=e.slice(a,a+c);b.decryptBlock(e,a);x.call(this,
e,a,c);this._prevBlock=d}});b=b.CBC=q;q=(p.pad={}).Pkcs7={pad:function(a,b){for(var c=4*b,c=c-a.sigBytes%c,d=c<<24|c<<16|c<<8|c,l=[],n=0;n<c;n+=4)l.push(d);c=s.create(l,c);a.concat(c)},unpad:function(a){a.sigBytes-=a.words[a.sigBytes-1>>>2]&255}};d.BlockCipher=v.extend({cfg:v.cfg.extend({mode:b,padding:q}),reset:function(){v.reset.call(this);var a=this.cfg,b=a.iv,a=a.mode;if(this._xformMode==this._ENC_XFORM_MODE)var c=a.createEncryptor;else c=a.createDecryptor,this._minBufferSize=1;this._mode=c.call(a,
this,b&&b.words)},_doProcessBlock:function(a,b){this._mode.processBlock(a,b)},_doFinalize:function(){var a=this.cfg.padding;if(this._xformMode==this._ENC_XFORM_MODE){a.pad(this._data,this.blockSize);var b=this._process(!0)}else b=this._process(!0),a.unpad(b);return b},blockSize:4});var n=d.CipherParams=l.extend({init:function(a){this.mixIn(a)},toString:function(a){return(a||this.formatter).stringify(this)}}),b=(p.format={}).OpenSSL={stringify:function(a){var b=a.ciphertext;a=a.salt;return(a?s.create([1398893684,
1701076831]).concat(a).concat(b):b).toString(r)},parse:function(a){a=r.parse(a);var b=a.words;if(1398893684==b[0]&&1701076831==b[1]){var c=s.create(b.slice(2,4));b.splice(0,4);a.sigBytes-=16}return n.create({ciphertext:a,salt:c})}},a=d.SerializableCipher=l.extend({cfg:l.extend({format:b}),encrypt:function(a,b,c,d){d=this.cfg.extend(d);var l=a.createEncryptor(c,d);b=l.finalize(b);l=l.cfg;return n.create({ciphertext:b,key:c,iv:l.iv,algorithm:a,mode:l.mode,padding:l.padding,blockSize:a.blockSize,formatter:d.format})},
decrypt:function(a,b,c,d){d=this.cfg.extend(d);b=this._parse(b,d.format);return a.createDecryptor(c,d).finalize(b.ciphertext)},_parse:function(a,b){return"string"==typeof a?b.parse(a,this):a}}),p=(p.kdf={}).OpenSSL={execute:function(a,b,c,d){d||(d=s.random(8));a=w.create({keySize:b+c}).compute(a,d);c=s.create(a.words.slice(b),4*c);a.sigBytes=4*b;return n.create({key:a,iv:c,salt:d})}},c=d.PasswordBasedCipher=a.extend({cfg:a.cfg.extend({kdf:p}),encrypt:function(b,c,d,l){l=this.cfg.extend(l);d=l.kdf.execute(d,
b.keySize,b.ivSize);l.iv=d.iv;b=a.encrypt.call(this,b,c,d.key,l);b.mixIn(d);return b},decrypt:function(b,c,d,l){l=this.cfg.extend(l);c=this._parse(c,l.format);d=l.kdf.execute(d,b.keySize,b.ivSize,c.salt);l.iv=d.iv;return a.decrypt.call(this,b,c,d.key,l)}})}();
(function(){for(var u=CryptoJS,p=u.lib.BlockCipher,d=u.algo,l=[],s=[],t=[],r=[],w=[],v=[],b=[],x=[],q=[],n=[],a=[],c=0;256>c;c++)a[c]=128>c?c<<1:c<<1^283;for(var e=0,j=0,c=0;256>c;c++){var k=j^j<<1^j<<2^j<<3^j<<4,k=k>>>8^k&255^99;l[e]=k;s[k]=e;var z=a[e],F=a[z],G=a[F],y=257*a[k]^16843008*k;t[e]=y<<24|y>>>8;r[e]=y<<16|y>>>16;w[e]=y<<8|y>>>24;v[e]=y;y=16843009*G^65537*F^257*z^16843008*e;b[k]=y<<24|y>>>8;x[k]=y<<16|y>>>16;q[k]=y<<8|y>>>24;n[k]=y;e?(e=z^a[a[a[G^z]]],j^=a[a[j]]):e=j=1}var H=[0,1,2,4,8,
16,32,64,128,27,54],d=d.AES=p.extend({_doReset:function(){for(var a=this._key,c=a.words,d=a.sigBytes/4,a=4*((this._nRounds=d+6)+1),e=this._keySchedule=[],j=0;j<a;j++)if(j<d)e[j]=c[j];else{var k=e[j-1];j%d?6<d&&4==j%d&&(k=l[k>>>24]<<24|l[k>>>16&255]<<16|l[k>>>8&255]<<8|l[k&255]):(k=k<<8|k>>>24,k=l[k>>>24]<<24|l[k>>>16&255]<<16|l[k>>>8&255]<<8|l[k&255],k^=H[j/d|0]<<24);e[j]=e[j-d]^k}c=this._invKeySchedule=[];for(d=0;d<a;d++)j=a-d,k=d%4?e[j]:e[j-4],c[d]=4>d||4>=j?k:b[l[k>>>24]]^x[l[k>>>16&255]]^q[l[k>>>
8&255]]^n[l[k&255]]},encryptBlock:function(a,b){this._doCryptBlock(a,b,this._keySchedule,t,r,w,v,l)},decryptBlock:function(a,c){var d=a[c+1];a[c+1]=a[c+3];a[c+3]=d;this._doCryptBlock(a,c,this._invKeySchedule,b,x,q,n,s);d=a[c+1];a[c+1]=a[c+3];a[c+3]=d},_doCryptBlock:function(a,b,c,d,e,j,l,f){for(var m=this._nRounds,g=a[b]^c[0],h=a[b+1]^c[1],k=a[b+2]^c[2],n=a[b+3]^c[3],p=4,r=1;r<m;r++)var q=d[g>>>24]^e[h>>>16&255]^j[k>>>8&255]^l[n&255]^c[p++],s=d[h>>>24]^e[k>>>16&255]^j[n>>>8&255]^l[g&255]^c[p++],t=
d[k>>>24]^e[n>>>16&255]^j[g>>>8&255]^l[h&255]^c[p++],n=d[n>>>24]^e[g>>>16&255]^j[h>>>8&255]^l[k&255]^c[p++],g=q,h=s,k=t;q=(f[g>>>24]<<24|f[h>>>16&255]<<16|f[k>>>8&255]<<8|f[n&255])^c[p++];s=(f[h>>>24]<<24|f[k>>>16&255]<<16|f[n>>>8&255]<<8|f[g&255])^c[p++];t=(f[k>>>24]<<24|f[n>>>16&255]<<16|f[g>>>8&255]<<8|f[h&255])^c[p++];n=(f[n>>>24]<<24|f[g>>>16&255]<<16|f[h>>>8&255]<<8|f[k&255])^c[p++];a[b]=q;a[b+1]=s;a[b+2]=t;a[b+3]=n},keySize:8});u.AES=p._createHelper(d)})();
CryptoJS.pad.NoPadding={pad:function(){},unpad:function(){}};

globalThis.CryptoJS = CryptoJS;