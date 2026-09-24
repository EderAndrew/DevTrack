-- 004/US9: "Aula concluída" per topic. A new enum value cannot be used in the transaction that
-- adds it, so the column and its CHECK come in the next migration.
ALTER TYPE "topic_status" ADD VALUE 'COMPLETED' BEFORE 'ARCHIVED';
