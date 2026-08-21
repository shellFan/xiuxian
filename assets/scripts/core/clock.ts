export interface Clock {
  now(): number;
}

export class SystemClock implements Clock {
  public now(): number { return Date.now(); }
}

export class FixedClock implements Clock {
  public constructor(private readonly value: number) {}
  public now(): number { return this.value; }
}

export class FakeClock implements Clock {
  public constructor(private current: number = 0) {}
  public now(): number { return this.current; }
  public set(value: number): void { this.current = value; }
  public advance(milliseconds: number): void { this.current += milliseconds; }
}

export const DEFAULT_CLOCK: Clock = new SystemClock();
