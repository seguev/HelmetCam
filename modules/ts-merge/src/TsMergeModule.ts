import { NativeModule, requireNativeModule } from 'expo';

import { MergeResult, TsMergeModuleEvents } from './TsMerge.types';

declare class TsMergeModule extends NativeModule<TsMergeModuleEvents> {
  merge(inputs: string[], output: string): Promise<MergeResult>;
}

export default requireNativeModule<TsMergeModule>('TsMerge');
