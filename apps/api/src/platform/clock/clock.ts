import { Global, Module } from "@nestjs/common";

/**
 * The server's clock (constitution III: the server is the authority on time). Request-driven rules
 * that compare with "now" — the 012 publication phase, deadline and late flag (research P4, P10) —
 * read it through this token, so tests fix and advance time instead of sleeping. Workers keep
 * taking `now` as a parameter (`runOnce(now)`).
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol("CLOCK");

export const systemClock: Clock = { now: () => new Date() };

@Global()
@Module({ providers: [{ provide: CLOCK, useValue: systemClock }], exports: [CLOCK] })
export class ClockModule {}
