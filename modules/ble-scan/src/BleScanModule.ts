import { NativeModule, requireNativeModule } from 'expo';

import { AudioDevice, BleConnection, BleScanModuleEvents } from './BleScan.types';

declare class BleScanModule extends NativeModule<BleScanModuleEvents> {
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  connect(id: string): Promise<BleConnection>;
  disconnect(id: string): Promise<void>;
  audioDevices(): Promise<AudioDevice[]>;
}

export default requireNativeModule<BleScanModule>('BleScan');
