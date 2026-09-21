import { Module } from "@nestjs/common";
import { AccessRecordsJob } from "./access-records.job";
import { AuditRetentionJob } from "./audit-retention.job";
import { UnverifiedAccountsJob } from "./unverified-accounts.job";

/** Retention jobs (FR-017, FR-076, FR-077); each registers itself with MaintenanceService. */
@Module({ providers: [UnverifiedAccountsJob, AccessRecordsJob, AuditRetentionJob] })
export class RetentionModule {}
