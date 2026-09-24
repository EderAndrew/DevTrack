import type { Tx } from "../database/transaction";

/** Where a stored file lives and what it was when written. */
export interface StoredFileRef {
  /** Server-generated storage key (never derived from the file name). */
  key: string;
  /** SHA-256 of the bytes, 32 bytes. */
  sha256: Buffer;
  sizeBytes: number;
}

/**
 * Storage port for original files (research E4). Files are written inside the caller's
 * transaction, so a document and its file commit or roll back together, and are immutable.
 * The only implementation today is PostgresFileStorage; object storage can replace it later
 * without touching the services.
 */
export abstract class FileStorage {
  abstract put(tx: Tx, bytes: Buffer): Promise<StoredFileRef>;
  /** The bytes, after checking them against the SHA-256 recorded at write time (500 if they differ). */
  abstract get(key: string, tx?: Tx): Promise<Buffer>;
}
