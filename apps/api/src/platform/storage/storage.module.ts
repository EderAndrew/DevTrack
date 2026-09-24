import { Global, Module } from "@nestjs/common";
import { FileStorage } from "./file-storage";
import { PostgresFileStorage } from "./postgres-file-storage";

@Global()
@Module({
  providers: [{ provide: FileStorage, useClass: PostgresFileStorage }],
  exports: [FileStorage],
})
export class StorageModule {}
