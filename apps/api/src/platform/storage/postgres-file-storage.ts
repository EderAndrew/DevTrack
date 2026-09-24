import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import type { Tx } from "../database/transaction";
import { AppException } from "../http/errors";
import { FileStorage, type StoredFileRef } from "./file-storage";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest();

/**
 * Original files in `stored_files` (bytea), a table of their own so that listings never load
 * bytes (research E4). A trigger rejects UPDATE and DELETE (004/FR-010).
 */
@Injectable()
export class PostgresFileStorage extends FileStorage {
  private readonly logger = new Logger("FileStorage");

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(tx: Tx, bytes: Buffer): Promise<StoredFileRef> {
    const digest = sha256(bytes);
    const row = await tx.storedFile.create({
      data: { bytes: new Uint8Array(bytes), sizeBytes: bytes.length, sha256: new Uint8Array(digest) },
      select: { id: true },
    });
    return { key: row.id, sha256: digest, sizeBytes: bytes.length };
  }

  async get(key: string, tx?: Tx): Promise<Buffer> {
    const row = await (tx ?? this.prisma).storedFile.findUnique({
      where: { id: key },
      select: { bytes: true, sha256: true, sizeBytes: true },
    });
    // A document always points at an existing file (FK), so a missing key is an internal error.
    if (!row) throw new AppException("INTERNAL_ERROR");

    const bytes = Buffer.from(row.bytes);
    if (bytes.length !== row.sizeBytes || !sha256(bytes).equals(Buffer.from(row.sha256))) {
      // Never serve corrupted bytes (research E18); the log names the file, not its content.
      this.logger.error({ fileId: key }, "syllabus.checksum_mismatch");
      throw new AppException("INTERNAL_ERROR");
    }
    return bytes;
  }
}
