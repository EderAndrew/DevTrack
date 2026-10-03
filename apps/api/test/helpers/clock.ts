import type { Clock } from "../../src/platform/clock/clock";

/** A clock the test sets and advances (012 research P10): no real time, no `sleep`. */
export class FixedClock implements Clock {
  private current: Date;

  constructor(start: Date | string = "2026-10-01T12:00:00.000Z") {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(instant: Date | string): void {
    this.current = new Date(instant);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
