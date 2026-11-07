// The wake-up alarm needs background location, which only the iPhone app has.
import type { AlarmOptions, ArmedTrip, Destination } from './storage';

export const subscribe = (_fn: (trip: ArmedTrip | null) => void) => () => {};

export const requestPermissions = async (): Promise<string | null> => 'The wake-up alarm is only available in the iPhone app.';
export const arm = async (_dest: Destination, _options: AlarmOptions, _dueAt?: Date) => {};
export const updateAlarm = async (_options: AlarmOptions) => {};
export const disarm = async () => {};
export const syncTracking = async () => {};
