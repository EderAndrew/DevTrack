-- 007 (Curriculum Agent): a draft created by applying an AI proposal. A new enum value cannot be
-- used in the transaction that adds it, so the column and its CHECK come in the next migration.
ALTER TYPE "syllabus_revision_source" ADD VALUE 'AI_ASSISTED';
