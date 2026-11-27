import type { IGuidanceClock } from '@scholaracle/interfaces';

export class SystemGuidanceClock implements IGuidanceClock {
  public now(): Date {
    return new Date();
  }
}
