import type { User } from '@scholaracle/database';

/**
 * True when the user has at least one phone that registered for push. Senders check this
 * before queueing a push, so nobody queues a delivery that has no device to go to.
 */
export function hasPushDevice(user: User | null): user is User {
  return (
    user !== null &&
    user.devices.some((d) => typeof d.pushToken === 'string' && d.pushToken.length > 0)
  );
}
