-- 027 — Turmas do gestor e disciplinas da turma: the enum values (research Q9).
-- PostgreSQL cannot use a value added by ALTER TYPE … ADD VALUE in the transaction that adds it
-- ("unsafe use of new value"), and the transition in 20261118120000_027_manager_classes writes
-- 'MERGED'; so the values come in this migration of their own.

-- New: why an enrollment ended (the service writes MANAGER from 027 on; the transition writes MERGED;
-- the 003 rows, removed by the teacher, stay NULL).
CREATE TYPE "enrollment_removal_reason" AS ENUM ('MANAGER', 'MERGED');

-- New: how the student entered the turma (FR-034).
CREATE TYPE "enrollment_source" AS ENUM ('INVITATION', 'DIRECT');

-- The seventh e-mail: "Você foi incluído na turma" (FR-034).
ALTER TYPE "mail_kind" ADD VALUE 'CLASS_ENROLLMENT_NOTICE';

-- MANAGER: cancelled by the gestor (TEACHER stays for the 003 rows); ENROLLED_DIRECTLY: the student was
-- enrolled directly (FR-034); MERGED: a duplicate merged by the transition (FR-028).
ALTER TYPE "class_invitation_cancel_reason" ADD VALUE 'MANAGER';
ALTER TYPE "class_invitation_cancel_reason" ADD VALUE 'ENROLLED_DIRECTLY';
ALTER TYPE "class_invitation_cancel_reason" ADD VALUE 'MERGED';
