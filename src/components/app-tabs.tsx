import { NativeTabs } from 'expo-router/native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="video" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="controls">
        <NativeTabs.Trigger.Label>Controls</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="slider.horizontal.3" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="bluetooth">
        <NativeTabs.Trigger.Label>Bluetooth</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="dot.radiowaves.left.and.right" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
