'use strict';

const path = require('path');
const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs').promises;

const PLUGIN_NAME = 'homebridge-tauron-elicznik';
const PLATFORM_NAME = 'tauroneLicznik';

let Accessory, Characteristic, Service, Categories, UUID;

module.exports = (api) => {
  Accessory = api.platformAccessory;
  Characteristic = api.hap.Characteristic;
  Service = api.hap.Service;
  Categories = api.hap.Categories;
  UUID = api.hap.uuid;

  class tauroneLicznikEnergyImport extends Characteristic {
    constructor() {
      super('Energy import', '00000001-000B-1000-8000-0026BB765291');
      this.setProps({
        format: Characteristic.Formats.FLOAT,
        unit: 'kWh',
        maxValue: 1000000,
        minValue: 0,
        minStep: 0.001,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
      });
      this.value = this.getDefaultValue();
    }
  }
  Characteristic.tauroneLicznikEnergyImport = tauroneLicznikEnergyImport;

  class tauroneLicznikEnergyExport extends Characteristic {
    constructor() {
      super('Energy export', '00000002-000B-1000-8000-0026BB765291');
      this.setProps({
        format: Characteristic.Formats.FLOAT,
        unit: 'kWh',
        maxValue: 1000000,
        minValue: 0,
        minStep: 0.001,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
      });
      this.value = this.getDefaultValue();
    }
  }
  Characteristic.tauroneLicznikEnergyExport = tauroneLicznikEnergyExport;

  class tauroneLicznikEnergyService extends Service {
    constructor(displayName, subtype, ) {
      super(displayName, '00000001-000A-1000-8000-0026BB765291', subtype);
      // Mandatory Characteristics
      this.addCharacteristic(Characteristic.tauroneLicznikEnergyImport);
      // Optional Characteristics
      this.addOptionalCharacteristic(Characteristic.tauroneLicznikEnergyExport);
    }
  }
  Service.tauroneLicznikEnergyService = tauroneLicznikEnergyService;

  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, tauroneLicznikPlatform, true);
}

class tauroneLicznikPlatform {
  constructor(log, config, api) {
    // only load if configured
    if (!config || !Array.isArray(config.devices)) {
      log('No configuration found for %s', PLUGIN_NAME);
      return;
    }
    this.log = log;
    this.api = api;
    this.devices = config.devices || [];
    this.accessories = [];

    this.api.on('didFinishLaunching', () => {
      this.log.debug('didFinishLaunching');
      for (let i = 0; i < this.devices.length; i++) {
        const device = this.devices[i];
        if (!device.name) {
          this.log.warn('Device Name Missing');
        } else {
          new eLicznikDevice(this.log, device, this.api);
        }
      }
    });
  }

  configureAccessory(accessory) {
    this.log.debug('configurePlatformAccessory');
    this.accessories.push(accessory);
  }

  removeAccessory(accessory) {
    this.log.debug('removePlatformAccessory');
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  }
}

class eLicznikDevice {
  constructor(log, config, api) {
    this.log = log;
    this.api = api;

    //device configuration
    this.name = config.name;
    this.user = config.user;
    this.passwd = config.passwd;
    this.meterId = config.meterId;
    this.refreshInterval = config.refreshInterval || 30;
    this.disableLogInfo = config.disableLogInfo;

    //get Device info
    this.manufacturer = config.manufacturer || 'Tauron';
    this.modelName = config.modelName || 'eLicznik';
    this.serialNumber = config.serialNumber || 'Serial Number';
    this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

    //setup variables
    this.checkDeviceInfo = true;
    this.checkDeviceState = false;
    this.startPrepareAccessory = true;
    this.energyImport = 0;
    this.energyExport = 0;

    const prefDir = path.join(api.user.storagePath(), 'eLicznik');

    //check if the directory exists, if not then create it
    if (fs.existsSync(prefDir) == false) {
      fsPromises.mkdir(prefDir);
    }

    //Check device state
    setInterval(function () {
      if (this.checkDeviceInfo) {
        this.getDeviceInfo();
      }
      if (this.checkDeviceState) {
        this.updateDeviceState();
      }
    }.bind(this), this.refreshInterval * 1000);

    //start prepare accessory
    if (this.startPrepareAccessory) {
      this.prepareAccessory();
    }
  }

  async getDeviceInfo() {
    this.log.debug('Device: %s %s, requesting Device Info.', this.meterId, this.name);
    try {
      this.log('-------- %s --------', this.name);
      this.log('Manufacturer: %s', this.manufacturer);
      this.log('Model: %s', this.modelName);
      this.log('Meter Id: %s', this.meterId);
      this.log('Serialnr: %s', this.serialNumber);
      this.log('Firmware: %s', this.firmwareRevision);
      this.log('----------------------------------');

      this.checkDeviceInfo = false;
      this.updateDeviceState();
    } catch (error) {
      this.log.error('Device: %s %s, Device Info eror: %s, state: Offline, trying to reconnect', this.meterId, this.name, error);
      this.checkDeviceInfo = true;
    }
  }

  async updateDeviceState() {
    this.log.debug('Device: %s %s, requesting Device state.', this.meterId, this.name);
    try {

      const energyImport = 0;
      const energyExport = 0;
      if (this.tauroneLicznikEnergyService) {
        this.tauroneLicznikEnergyService
          .updateCharacteristic(Characteristic.tauroneLicznikEnergyImport, energyImport)
          .updateCharacteristic(Characteristic.tauroneLicznikEnergyExport, energyExport);
      }
      this.energyImport = energyImport;
      this.energyExport = energyExport;

      this.checkDeviceState = true;
    } catch (error) {
      this.log.error('Device: %s %s, update Device state error: %s', this.meterId, this.name, error);
      this.checkDeviceState = false;
      this.checkDeviceInfo = true;
    }
  }

  //Prepare accessory
  prepareAccessory() {
    this.log.debug('prepareAccessory');
    const accessoryName = this.name;
    const accessoryUUID = UUID.generate(accessoryName);
    const accessoryCategory = Categories.OTHER;
    const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

    //Prepare information service
    this.log.debug('prepareInformationService');
    const manufacturer = this.manufacturer;
    const modelName = this.modelName;
    const serialNumber = this.serialNumber;
    const firmwareRevision = this.firmwareRevision;

    accessory.removeService(accessory.getService(Service.AccessoryInformation));
    const informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Name, accessoryName)
      .setCharacteristic(Characteristic.Manufacturer, manufacturer)
      .setCharacteristic(Characteristic.Model, modelName)
      .setCharacteristic(Characteristic.SerialNumber, serialNumber)
      .setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);

    accessory.addService(informationService);

    //Prepare service 
    this.log.debug('prepareTauroneLicznikService');
    //power and energy
    this.tauroneLicznikEnergyService = new Service.tauroneLicznikEnergyService('Meter ' + this.meterId, 'tauroneLicznikEnergyService');
    this.tauroneLicznikEnergyService.getCharacteristic(Characteristic.tauroneLicznikEnergyImport)
      .onGet(async () => {
        const value = this.energyImport;
        if (!this.disableLogInfo) {
          this.log('Device: %s %s, energy import: %s kWh', this.meterId, accessoryName, value);
        }
        return value;
      });
    this.tauroneLicznikEnergyService.getCharacteristic(Characteristic.tauroneLicznikEnergyExport)
      .onGet(async () => {
        const value = this.energyExport;
        if (!this.disableLogInfo) {
          this.log('Device: %s %s, energy export: %s kWh', this.meterId, accessoryName, value);
        }
        return value;
      });
    accessory.addService(this.tauroneLicznikEnergyService);

    this.startPrepareAccessory = false;
    this.log.debug('Device: %s %s, publishExternalAccessories.', this.meterId, accessoryName);
    this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
  }
}