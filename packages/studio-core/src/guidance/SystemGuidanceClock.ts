import type { IGuidanceClock } from '@scholaracle/interfaces';

export class SystemGuidanceClock implements IGuidanceClock {
  public now(): Date {
    return new Date();
  }

  public localHour(timezone: string): number {
    const hourPart = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(this.now())
      .find((p) => p.type === 'hour')?.value;
    const hour = Number(hourPart);
    return hour === 24 ? 0 : hour;
  }
}
