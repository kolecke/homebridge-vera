var path = require('path');
var fs = require('fs');
var request = require('request');
var Service, Characteristic;

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerPlatform("homebridge-vera", "Vera", VeraPlatform);
};

function VeraPlatform(log, config) {
    this.log = log;
    this.request = request.defaults({
        baseUrl: 'http://' + config.host + ':3480/'
    });
    this.log("VeraPlatform Platform Plugin Version " + this.getVersion());
}

VeraPlatform.prototype.getVersion = function () {
    return JSON.parse(fs.readFileSync(path.join(__dirname, './package.json'))).version;
};

VeraPlatform.prototype.getDataRequest = function (id, callback) {
    var options = {
        uri: '/data_request',
        json: true,
        qs: {
            id: id
        }
    };
    this.request.get(options, callback);
};

VeraPlatform.prototype.accessories = function (callback) {
    this.log("Fetching Vera Accessories...");
    var platform = this;
    var accessories = [];
    this.getDataRequest('user_data', function (error, message, response) {
        if (error) {
            console.error(error);
        } else {
            response.devices.forEach(function (device) {
                if (!device.invisible) {
                    accessories.push(new VeraAccessory(platform, device));
                }
            });
        }
        callback(accessories);
    });
};

function VeraAccessory(platform, device) {
    this.name = device.name;

    this.manufacturer = device.manufacturer;
    this.model = device.model;
    this.serialNumber = device.local_udn;

    this.platform = platform;
    this.device = device;
}

VeraAccessory.prototype.identify = function (callback) {
    if (!callback) {
        return;
    }
    this.platform.log('Identify ' + this.name);
    callback();
};

VeraAccessory.prototype.getValue = function (service, variable, callback) {
    var options = {
        uri: '/data_request',
        qs: {
            id: 'variableget',
            DeviceNum: this.device.id,
            serviceId: service,
            Variable: variable
        }
    };
    this.platform.request.get(options, function (error, message, response) {
        if (error) {
            console.error(error);
        }
        callback(error, response);
    });
};

VeraAccessory.prototype.getThermostatService = function () {

    var thermostatService = new Service.Thermostat(this.device.name);
    var self = this;

    var currentHeatingCoolingState = {
        'Idle': 'OFF',
        'Heating': 'HEAT',
        'Cooling': 'COOL'
    };

    thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
        .on('get', function (callback) {
            self.getValue('urn:micasaverde-com:serviceId:HVAC_OperatingState1', 'ModeState', function (error, value) {
                callback(error, Characteristic.CurrentHeatingCoolingState[currentHeatingCoolingState[value] || 'value']);
            });
        });

    var targetHeatingCoolingState = {
        'Off': 'OFF',
        'CoolOn': 'COOL',
        'HeatOn': 'HEAT',
        'AutoChangeOver': 'AUTO'
    };

    thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .on('get', function (callback) {
            self.getValue('urn:upnp-org:serviceId:HVAC_UserOperatingMode1', 'ModeStatus', function (error, value) {
                callback(error, Characteristic.TargetHeatingCoolingState[targetHeatingCoolingState[value] || 'value']);
            });
        })
        .on('set', function (value, callback) {
            callback(null);
        });

    thermostatService.getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', function (callback) {
            self.getValue('urn:upnp-org:serviceId:TemperatureSensor1', 'CurrentTemperature', function (error, value) {
                callback(error, value ? (parseFloat(value) - 32) * 5 / 9 : Characteristic.CurrentTemperature.value);
            });
        });

    thermostatService.getCharacteristic(Characteristic.TargetTemperature)
        .on('get', function (callback) {
            self.getValue('urn:upnp-org:serviceId:TemperatureSetpoint1', 'CurrentSetpoint', function (error, value) {
                callback(error, value ? (parseFloat(value) - 32) * 5 / 9 : Characteristic.TargetTemperature.value);
            });
        })
        .on('set', function (value, callback) {
            callback(null);
        });

    var temperatureDisplayUnits = {
        'C': 'CELSIUS',
        'F': 'FAHRENHEIT'
    };

    thermostatService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
        .on('get', function (callback) {
            self.getValue('urn:honeywell-com:serviceId:ThermostatData1', 'ThermostatUnits', function (error, value) {
                callback(error, Characteristic.TemperatureDisplayUnits[temperatureDisplayUnits[value] || 'value']);
            });
        })
        .on('set', function (value, callback) {
            callback(null);
        });

    thermostatService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .on('get', function (callback) {
            self.getValue('urn:honeywell-com:serviceId:ThermostatData1', 'IndoorHumidity', function (error, value) {
                callback(error, value ? parseFloat(value) : Characteristic.CurrentRelativeHumidity.value);
            });
        });

    return thermostatService;
};

VeraAccessory.prototype.getLockMechanismService = function () {

    var lockMechanismService = new Service.LockMechanism(this.device.name);
    var self = this;

    var lockState = {
        '0': 'UNSECURED',
        '1': 'SECURED'
    };

    lockMechanismService.getCharacteristic(Characteristic.LockCurrentState)
        .on('get', function (callback) {
            self.getValue('urn:micasaverde-com:serviceId:DoorLock1', 'Status', function (error, value) {
                callback(error, Characteristic.LockCurrentState[lockState[value] || 'value']);
            });
        });

    lockMechanismService.getCharacteristic(Characteristic.LockTargetState)
        .on('get', function (callback) {
            self.getValue('urn:micasaverde-com:serviceId:DoorLock1', 'Target', function (error, value) {
                callback(error, Characteristic.LockTargetState[lockState[value] || 'value']);
            });
        })
        .on('set', function (value, callback) {
            callback(null);
        });

    return lockMechanismService;
};

VeraAccessory.prototype.getBatteryService = function () {

    var batteryService = new Service.BatteryService(this.device.name);
    var self = this;

    batteryService.getCharacteristic(Characteristic.BatteryLevel)
        .on('get', function (callback) {
            self.getValue('urn:micasaverde-com:serviceId:HaDevice1', 'BatteryLevel', function (error, value) {
                callback(error, value ? parseInt(value, 10) : Characteristic.BatteryLevel.value);
            });
        });

    return batteryService;
};

VeraAccessory.prototype.getServices = function () {

    var services = [];

    switch (this.device.device_type) {
    case 'urn:schemas-upnp-org:device:HVAC_ZoneThermostat:1':
        services.push(this.getThermostatService());
        break;
    case 'urn:schemas-micasaverde-com:device:DoorLock:1':
        services.push(this.getLockMechanismService());
        services.push(this.getBatteryService());
        break;
    }

    var informationService = new Service.AccessoryInformation();

    informationService
        .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
        .setCharacteristic(Characteristic.Model, this.model)
        .setCharacteristic(Characteristic.SerialNumber, this.serialNumber);

    services.push(informationService);

    return services;
};
