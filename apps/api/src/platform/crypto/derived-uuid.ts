import { createHash } from "node:crypto";

/**
 * A UUID derived from a name: the first 16 bytes of its SHA-256, with the version (5) and variant
 * bits of RFC 9562 (the UUID v5 layout, SHA-256 instead of SHA-1). The same name always gives
 * the same id, so a domain can derive an idempotency key (007 research C13).
 */
export function derivedUuid(name: string): string {
  const bytes = createHash("sha256").update(name, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
