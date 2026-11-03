// The wake-up alarm needs background location, which only the iPhone app has.
import type { ArmedTrip, Destination } from './storage';

export const subscribe = (_fn: (trip: ArmedTrip | null) => void) => () => {};

export const requestPermissions = async (): Promise<string | null> => 'The wake-up alarm is only available in the iPhone app.';
export const arm = async (_dest: Destination, _radius: number, _backupAt?: Date) => {};
export const disarm = async () => {};
