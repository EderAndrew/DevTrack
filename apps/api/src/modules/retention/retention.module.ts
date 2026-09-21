import { Module } from "@nestjs/common";
import { AuditRetentionJob } from "./audit-retention.job";
import { UnverifiedAccountsJob } from "./unverified-accounts.job";

/** Retention jobs (FR-017, FR-076, FR-077); each registers itself with MaintenanceService. */
@Module({ providers: [UnverifiedAccountsJob, AuditRetentionJob] })
export class RetentionModule {}
