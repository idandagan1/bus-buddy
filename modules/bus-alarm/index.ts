import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type AuthState = 'authorized' | 'denied' | 'notDetermined' | 'unavailable';

type BusAlarmNative = {
  isAvailable(): boolean;
  requestAuthorization(): Promise<AuthState>;
  schedule(id: string, timestampMs: number, title: string, sound: string | null): Promise<string>;
  cancel(id: string): void;
};

// Null on web, Android, Expo Go, or builds without the native module.
const native = Platform.OS === 'ios' ? requireOptionalNativeModule<BusAlarmNative>('BusAlarm') : null;

export const isAlarmKitAvailable = () => native?.isAvailable() ?? false;
export const requestAlarmAuthorization = async (): Promise<AuthState> => native?.requestAuthorization() ?? 'unavailable';
// sound: a bundled file name like 'rise.wav', or null for the system alarm sound.
export const scheduleAlarm = (id: string, at: Date, title: string, sound: string | null = null) =>
  native!.schedule(id, at.getTime(), title, sound);
export const cancelAlarm = (id: string) => native?.cancel(id);
