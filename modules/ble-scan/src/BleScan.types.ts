export type BleDevice = {
  id: string;
  name: string;
  rssi: number | null;
  connectable: boolean;
  services: string[];
  manufacturerData: string;
  alreadyConnectedToPhone: boolean;
};

export type BleCharacteristic = {
  uuid: string;
  properties: ('read' | 'write' | 'writeWithoutResponse' | 'notify' | 'indicate')[];
};

export type BleService = {
  uuid: string;
  characteristics: BleCharacteristic[];
};

export type BleConnection = {
  id: string;
  name: string;
  services: BleService[];
};

export type BleState = 'poweredOn' | 'poweredOff' | 'unauthorized' | 'unsupported' | 'resetting' | 'unknown';

export type AudioDevice = {
  name: string;
  type: string;
};

export type BleScanModuleEvents = {
  onState: (params: { state: BleState }) => void;
  onDevice: (device: BleDevice) => void;
  onDisconnect: (params: { id: string }) => void;
};
