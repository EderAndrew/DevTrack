let sequence = 0;

/**
 * `<jornada>-<timestamp>@example.test` (research S14): unique per run, so journeys never share
 * rate-limit counters and each one reads only its own messages in the shared Mailpit.
 */
export function uniqueEmail(journey: string): string {
  sequence += 1;
  return `${journey}-${Date.now()}-${process.pid}-${sequence}@example.test`;
}
