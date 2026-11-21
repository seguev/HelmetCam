import { registerWebModule, NativeModule } from 'expo';

import { TsMergeModuleEvents } from './TsMerge.types';

class TsMergeModule extends NativeModule<TsMergeModuleEvents> {}

export default registerWebModule(TsMergeModule, 'TsMergeModule');
