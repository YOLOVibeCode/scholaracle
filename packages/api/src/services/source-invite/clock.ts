export interface IClock {
  now(): Date;
}

export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}

export class FakeClock implements IClock {
  constructor(private _now: Date) {}

  now(): Date {
    return this._now;
  }

  advance(ms: number): void {
    this._now = new Date(this._now.getTime() + ms);
  }
}
