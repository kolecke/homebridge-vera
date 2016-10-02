'use strict';

const path = require('path');
const fs = require('fs');
const request = require('request');

var Service;
var Characteristic;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerPlatform('homebridge-vera', 'Vera', VeraPlatform);
};

class VeraPlatform {
    constructor(log, config) {
        this.log = log;
        this.request = request.defaults({
            baseUrl: `http://${config.host}:3480/`
        });
        this.log(`VeraPlatform Platform Plugin Version ${this.getVersion()}`);
    }
    getVersion() {
        return JSON.parse(fs.readFileSync(path.join(__dirname, './package.json'))).version;
    }
    getDataRequest(id, callback) {
        var options = {
            uri: '/data_request',
            json: true,
            qs: {
                id: id
            }
        };
        this.request.get(options, callback);
    }
    accessories(callback) {
        this.log('Fetching Vera Accessories...');
        var platform = this;
        var accessories = [];
        this.getDataRequest('user_data', (error, message, response) => {
            if (error) {
                console.error(error);
            } else {
                response.devices.forEach((device) => {
                    if (!device.invisible) {
                        accessories.push(new VeraAccessory(platform, device));
                    }
                });
            }
            callback(accessories);
        });
    }
}

class VeraAccessory {
    constructor(platform, device) {
        this.name = device.name;
        this.manufacturer = device.manufacturer;
        this.model = device.model;
        this.serialNumber = device.local_udn;
        this.platform = platform;
        this.device = device;
    }
    identify(callback) {
        if (!callback) {
            return;
        }
        this.platform.log('Identify ' + this.name);
        callback();
    }
    getValue(service, variable, callback) {
        var options = {
            uri: '/data_request',
            qs: {
                id: 'variableget',
                DeviceNum: this.device.id,
                serviceId: service,
                Variable: variable
            }
        };
        this.platform.request.get(options, (error, message, response) => {
            if (error) {
                console.error(error);
            }
            callback(error, response);
        });
    }
    getThermostatService() {

        var thermostatService = new Service.Thermostat(this.device.name);
        var self = this;

        var currentHeatingCoolingState = {
            'Idle': 'OFF',
            'Heating': 'HEAT',
            'Cooling': 'COOL'
        };

        thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on('get', (callback) => {
                self.getValue('urn:micasaverde-com:serviceId:HVAC_OperatingState1', 'ModeState', (error, value) => {
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
            .on('get', (callback) => {
                self.getValue('urn:upnp-org:serviceId:HVAC_UserOperatingMode1', 'ModeStatus', (error, value) => {
                    callback(error, Characteristic.TargetHeatingCoolingState[targetHeatingCoolingState[value] || 'value']);
                });
            })
            .on('set', (value, callback) => {
                callback(null);
            });

        thermostatService.getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', (callback) => {
                self.getValue('urn:upnp-org:serviceId:TemperatureSensor1', 'CurrentTemperature', (error, value) => {
                    callback(error, value ? (parseFloat(value) - 32) * 5 / 9 : Characteristic.CurrentTemperature.value);
                });
            });

        thermostatService.getCharacteristic(Characteristic.TargetTemperature)
            .on('get', (callback) => {
                self.getValue('urn:upnp-org:serviceId:TemperatureSetpoint1', 'CurrentSetpoint', (error, value) => {
                    callback(error, value ? (parseFloat(value) - 32) * 5 / 9 : Characteristic.TargetTemperature.value);
                });
            })
            .on('set', (value, callback) => {
                callback(null);
            });

        var temperatureDisplayUnits = {
            'C': 'CELSIUS',
            'F': 'FAHRENHEIT'
        };

        thermostatService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .on('get', (callback) => {
                self.getValue('urn:honeywell-com:serviceId:ThermostatData1', 'ThermostatUnits', (error, value) => {
                    callback(error, Characteristic.TemperatureDisplayUnits[temperatureDisplayUnits[value] || 'value']);
                });
            })
            .on('set', (value, callback) => {
                callback(null);
            });

        thermostatService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .on('get', (callback) => {
                self.getValue('urn:honeywell-com:serviceId:ThermostatData1', 'IndoorHumidity', (error, value) => {
                    callback(error, value ? parseFloat(value) : Characteristic.CurrentRelativeHumidity.value);
                });
            });

        return thermostatService;
    }
    getLockMechanismService() {

        var lockMechanismService = new Service.LockMechanism(this.device.name);
        var self = this;

        var lockState = {
            '0': 'UNSECURED',
            '1': 'SECURED'
        };

        lockMechanismService.getCharacteristic(Characteristic.LockCurrentState)
            .on('get', (callback) => {
                self.getValue('urn:micasaverde-com:serviceId:DoorLock1', 'Status', (error, value) => {
                    callback(error, Characteristic.LockCurrentState[lockState[value] || 'value']);
                });
            });

        lockMechanismService.getCharacteristic(Characteristic.LockTargetState)
            .on('get', (callback) => {
                self.getValue('urn:micasaverde-com:serviceId:DoorLock1', 'Target', (error, value) => {
                    callback(error, Characteristic.LockTargetState[lockState[value] || 'value']);
                });
            })
            .on('set', (value, callback) => {
                callback(null);
            });

        return lockMechanismService;
    }
    getBatteryService() {

        var batteryService = new Service.BatteryService(this.device.name);
        var self = this;

        batteryService.getCharacteristic(Characteristic.BatteryLevel)
            .on('get', (callback) => {
                self.getValue('urn:micasaverde-com:serviceId:HaDevice1', 'BatteryLevel', (error, value) => {
                    callback(error, value ? parseInt(value, 10) : Characteristic.BatteryLevel.value);
                });
            });

        return batteryService;
    }
    getServices() {

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
    }
}
