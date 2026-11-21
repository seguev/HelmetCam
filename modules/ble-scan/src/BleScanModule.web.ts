import { registerWebModule, NativeModule } from 'expo';

import { BleScanModuleEvents } from './BleScan.types';

class BleScanModule extends NativeModule<BleScanModuleEvents> {}

export default registerWebModule(BleScanModule, 'BleScanModule');
