-- 027/T046: a pre-027 database (research Q9), written by SQL over the schema of the migrations before
-- 20261118115900_027_enum_values. Run by test/integration/027-transition.spec.ts as one multi-statement query (one
-- implicit transaction, so the deferred triggers check it at the end). Fixed ids: the database is temporary.
--
-- Teachers A, B and C; students S1, S2 and S3.
-- cA1 (A, Banco de Dados, 2026, ADS3NA, INACTIVE, the oldest) and cB1 (B, Redes, 2026, ads3na, ACTIVE): one turma.
-- cC1 (C, no subject, 2027, ADS3NA): another turma. cB2 (B, Redes, 2025, ARQ, ARCHIVED).
-- S1 ACTIVE in cA1 and cB1 (merged), S2 REMOVED by A in cA1 and ACTIVE in cB1, S3 in cC1, S1 in cB2.
-- The same e-mail pending in cA1 (expires first) and cB1; one pending in cC1. Raw tokens: "transicao027-convite-<a1|b1|c1>-" padded with "x" to 43 characters.

INSERT INTO users (id, email, name, password_hash, email_verified_at, updated_at) VALUES
 ('00000000-0000-4000-8000-0000000000a1', 'prof-a@example.test', 'Professora A', 'x', now(), now()),
 ('00000000-0000-4000-8000-0000000000b1', 'prof-b@example.test', 'Professor B', 'x', now(), now()),
 ('00000000-0000-4000-8000-0000000000c1', 'prof-c@example.test', 'Professor C', 'x', now(), now()),
 ('00000000-0000-4000-8000-000000000051', 'aluno-1@example.test', 'Aluno Um', 'x', now(), now()),
 ('00000000-0000-4000-8000-000000000052', 'aluno-2@example.test', 'Aluna Dois', 'x', now(), now()),
 ('00000000-0000-4000-8000-000000000053', 'aluno-3@example.test', 'Aluno Tres', 'x', now(), now());
INSERT INTO user_roles (user_id, role_id, status, granted_via)
SELECT v.uid, r.id, 'ACTIVE', v.via::grant_source
  FROM (VALUES ('00000000-0000-4000-8000-0000000000a1'::uuid, 'TEACHER', 'INVITATION'), ('00000000-0000-4000-8000-0000000000b1'::uuid, 'TEACHER', 'INVITATION'), ('00000000-0000-4000-8000-0000000000c1'::uuid, 'TEACHER', 'INVITATION'),
               ('00000000-0000-4000-8000-000000000051'::uuid, 'STUDENT', 'SELF_SIGNUP'), ('00000000-0000-4000-8000-000000000052'::uuid, 'STUDENT', 'SELF_SIGNUP'),
               ('00000000-0000-4000-8000-000000000053'::uuid, 'STUDENT', 'SELF_SIGNUP')) AS v(uid, rk, via)
  JOIN roles r ON r.key = v.rk;
INSERT INTO teacher_profiles (user_id, display_name, updated_at) VALUES
 ('00000000-0000-4000-8000-0000000000a1', 'Professora A', now()), ('00000000-0000-4000-8000-0000000000b1', 'Professor B', now()), ('00000000-0000-4000-8000-0000000000c1', 'Professor C', now());
INSERT INTO student_profiles (user_id, display_name, updated_at) VALUES
 ('00000000-0000-4000-8000-000000000051', 'Aluno Um', now()), ('00000000-0000-4000-8000-000000000052', 'Aluna Dois', now()),
 ('00000000-0000-4000-8000-000000000053', 'Aluno Tres', now());
INSERT INTO subjects (id, teacher_id, name, search_key, updated_at) VALUES
 ('00000000-0000-4000-8000-0000000005a1', '00000000-0000-4000-8000-0000000000a1', 'Banco de Dados', 'banco de dados', now()),
 ('00000000-0000-4000-8000-0000000005b1', '00000000-0000-4000-8000-0000000000b1', 'Redes', 'redes', now());
-- cA1 (oldest, INACTIVE) and cB1 (same code ignoring case, ACTIVE) -> one ACTIVE cohort with cA1's data;
-- cA2: same code, 2027, no subject; cB2: ARCHIVED, 2025.
INSERT INTO classes (id, teacher_id, name, code, academic_year, period, description, status, status_changed_at, search_key, subject_id, starts_on, ends_on, created_at, updated_at) VALUES
 ('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000000a1', 'ADS 3NA', 'ADS3NA', 2026, 'Noite', 'Turma da manhã', 'INACTIVE', '2026-03-01T00:00:00Z', 'ads 3na ads3na', '00000000-0000-4000-8000-0000000005a1', '2026-02-01', '2026-12-15', '2026-01-10T10:00:00Z', now()),
 ('00000000-0000-4000-8000-00000000c0b1', '00000000-0000-4000-8000-0000000000b1', 'ADS 3NA Redes', 'ads3na', 2026, 'Tarde', 'Outra descrição', 'ACTIVE', NULL, 'ads 3na redes ads3na', '00000000-0000-4000-8000-0000000005b1', NULL, NULL, '2026-01-20T10:00:00Z', now()),
 ('00000000-0000-4000-8000-00000000c0c1', '00000000-0000-4000-8000-0000000000c1', 'ADS 3NA', 'ADS3NA', 2027, NULL, NULL, 'ACTIVE', NULL, 'ads 3na ads3na', NULL, NULL, NULL, '2026-01-05T10:00:00Z', now()),
 ('00000000-0000-4000-8000-00000000c0b2', '00000000-0000-4000-8000-0000000000b1', 'Arquivada', 'ARQ', 2025, NULL, NULL, 'ARCHIVED', '2025-12-20T00:00:00Z', 'arquivada arq', '00000000-0000-4000-8000-0000000005b1', NULL, NULL, '2025-02-01T10:00:00Z', now());
INSERT INTO enrollments (id, class_id, student_user_id, status, enrolled_at, removed_at, removed_by_id, updated_at) VALUES
 ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-000000000051', 'ACTIVE', '2026-02-01T10:00:00Z', NULL, NULL, now()),
 ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000c0b1', '00000000-0000-4000-8000-000000000051', 'ACTIVE', '2026-02-05T10:00:00Z', NULL, NULL, now()),
 ('00000000-0000-4000-8000-00000000e003', '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-000000000052', 'REMOVED', '2026-02-01T11:00:00Z', '2026-02-10T10:00:00Z', '00000000-0000-4000-8000-0000000000a1', now()),
 ('00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000c0b1', '00000000-0000-4000-8000-000000000052', 'ACTIVE', '2026-02-06T10:00:00Z', NULL, NULL, now()),
 ('00000000-0000-4000-8000-00000000e005', '00000000-0000-4000-8000-00000000c0c1', '00000000-0000-4000-8000-000000000053', 'ACTIVE', '2026-02-07T10:00:00Z', NULL, NULL, now()),
 ('00000000-0000-4000-8000-00000000e006', '00000000-0000-4000-8000-00000000c0b2', '00000000-0000-4000-8000-000000000051', 'ACTIVE', '2025-02-07T10:00:00Z', NULL, NULL, now());
INSERT INTO works (id, teacher_id, subject_id, title, title_search_key, total_grade, question_count, origin, status, updated_at) VALUES
 ('00000000-0000-4000-8000-00000000f0a1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000005a1', 'Trabalho BD', 'trabalho bd', 1.00, 1, 'MANUAL', 'APPROVED', now()),
 ('00000000-0000-4000-8000-00000000f0b1', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000005b1', 'Trabalho Redes', 'trabalho redes', 1.00, 1, 'MANUAL', 'APPROVED', now());
INSERT INTO work_questions (work_id, position, type, grading_strategy, statement, statement_search_key, value, expected_answer, updated_at) VALUES
 ('00000000-0000-4000-8000-00000000f0a1', 0, 'OPEN_ANSWER', 'AI_REVIEW', 'Explique', 'explique', 1.00, 'Herança', now()),
 ('00000000-0000-4000-8000-00000000f0b1', 0, 'OPEN_ANSWER', 'AI_REVIEW', 'Explique', 'explique', 1.00, 'TCP', now());
INSERT INTO exercises (id, teacher_id, type, difficulty, cognitive_objective, origin, status, statement, statement_search_key, explanation, expected_answer, updated_at) VALUES
 ('00000000-0000-4000-8000-00000000ee01', '00000000-0000-4000-8000-0000000000a1', 'OPEN_ANSWER', 'INTERMEDIATE', 'UNDERSTAND', 'MANUAL', 'APPROVED', 'Explique', 'explique', 'Porque', 'Normalização', now());
INSERT INTO class_activities (id, class_id, teacher_id, type, title, total_grade, question_count, publish_at, deadline, late_policy,
   source_work_id, source_subject_id, result_released_at, result_released_by_id, idempotency_key, updated_at) VALUES
 ('00000000-0000-4000-8000-0000000aa001', '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000000a1', 'ASSIGNMENT', 'Trabalho BD', 1.00, 1,
  '2026-03-01T00:00:00Z', '2026-03-10T00:00:00Z', 'REJECT', '00000000-0000-4000-8000-00000000f0a1', '00000000-0000-4000-8000-0000000005a1', '2026-03-12T00:00:00Z', '00000000-0000-4000-8000-0000000000a1', gen_random_uuid(), now()),
 ('00000000-0000-4000-8000-0000000aa002', '00000000-0000-4000-8000-00000000c0b1', '00000000-0000-4000-8000-0000000000b1', 'ASSIGNMENT', 'Trabalho Redes', 1.00, 1,
  '2026-03-01T00:00:00Z', '2026-03-10T00:00:00Z', 'REJECT', '00000000-0000-4000-8000-00000000f0b1', '00000000-0000-4000-8000-0000000005b1', '2026-03-12T00:00:00Z', '00000000-0000-4000-8000-0000000000b1', gen_random_uuid(), now());
INSERT INTO class_activities (id, class_id, teacher_id, type, title, question_count, publish_at, idempotency_key, updated_at) VALUES
 ('00000000-0000-4000-8000-0000000aa003', '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000000a1', 'EXERCISE', 'Exercícios BD', 1, '2026-03-01T00:00:00Z', gen_random_uuid(), now());
INSERT INTO class_activity_questions (id, activity_id, position, type, grading_strategy, value, statement, expected_answer) VALUES
 ('00000000-0000-4000-8000-0000000ab001', '00000000-0000-4000-8000-0000000aa001', 0, 'OPEN_ANSWER', 'AI_REVIEW', 1.00, 'Explique', 'Herança'),
 ('00000000-0000-4000-8000-0000000ab002', '00000000-0000-4000-8000-0000000aa002', 0, 'OPEN_ANSWER', 'AI_REVIEW', 1.00, 'Explique', 'TCP');
INSERT INTO class_activity_questions (id, activity_id, position, type, grading_strategy, statement, expected_answer, explanation, source_exercise_id, difficulty, points) VALUES
 ('00000000-0000-4000-8000-0000000ab003', '00000000-0000-4000-8000-0000000aa003', 0, 'OPEN_ANSWER', 'AI_REVIEW', 'Explique', 'Normalização', 'Porque', '00000000-0000-4000-8000-00000000ee01', 'INTERMEDIATE', 30);
-- attempts: S1 in the BD work, S1 and S2 in the Redes work, S1 in the BD exercise
INSERT INTO activity_attempts (id, activity_id, student_user_id, number, status, started_at, updated_at) VALUES
 ('00000000-0000-4000-8000-0000000ac001', '00000000-0000-4000-8000-0000000aa001', '00000000-0000-4000-8000-000000000051', 1, 'IN_PROGRESS', '2026-03-02T10:00:00Z', now()),
 ('00000000-0000-4000-8000-0000000ac002', '00000000-0000-4000-8000-0000000aa002', '00000000-0000-4000-8000-000000000051', 1, 'IN_PROGRESS', '2026-03-02T10:00:00Z', now()),
 ('00000000-0000-4000-8000-0000000ac003', '00000000-0000-4000-8000-0000000aa002', '00000000-0000-4000-8000-000000000052', 1, 'IN_PROGRESS', '2026-03-02T10:00:00Z', now()),
 ('00000000-0000-4000-8000-0000000ac004', '00000000-0000-4000-8000-0000000aa003', '00000000-0000-4000-8000-000000000051', 1, 'IN_PROGRESS', '2026-03-02T10:00:00Z', now());
INSERT INTO activity_answers (attempt_id, activity_id, question_id, question_type, text, saved_at, saved_by_user_id)
SELECT a.id, a.activity_id, q.id, 'OPEN_ANSWER', 'Minha resposta', now(), a.student_user_id
  FROM activity_attempts a JOIN class_activity_questions q ON q.activity_id = a.activity_id;
UPDATE activity_attempts SET status = 'SUBMITTED' WHERE id <> '00000000-0000-4000-8000-0000000ac004';
UPDATE activity_attempts SET status = 'SUBMITTED', completed_at = '2026-03-02T11:00:00Z' WHERE id = '00000000-0000-4000-8000-0000000ac004';
INSERT INTO activity_submissions (id, attempt_id, activity_id, student_user_id, submitted_at, late, blank_count, grade, grade_partial, updated_at, submitted_by_user_id) VALUES
 ('00000000-0000-4000-8000-0000000ad001', '00000000-0000-4000-8000-0000000ac001', '00000000-0000-4000-8000-0000000aa001', '00000000-0000-4000-8000-000000000051', '2026-03-03T10:00:00Z', false, 0, 0.80, false, now(), '00000000-0000-4000-8000-000000000051'),
 ('00000000-0000-4000-8000-0000000ad002', '00000000-0000-4000-8000-0000000ac002', '00000000-0000-4000-8000-0000000aa002', '00000000-0000-4000-8000-000000000051', '2026-03-03T10:00:00Z', false, 0, 0.60, false, now(), '00000000-0000-4000-8000-000000000051'),
 ('00000000-0000-4000-8000-0000000ad003', '00000000-0000-4000-8000-0000000ac003', '00000000-0000-4000-8000-0000000aa002', '00000000-0000-4000-8000-000000000052', '2026-03-03T10:00:00Z', false, 0, 0.90, false, now(), '00000000-0000-4000-8000-000000000052');
INSERT INTO activity_question_gradings (submission_id, question_id, activity_id, status, nature, final_grade, teacher_grade, decided_by_id, decided_at)
SELECT s.id, q.id, s.activity_id, 'DECIDED', 'HUMAN_DECISION', s.grade, s.grade, c.teacher_id, now()
  FROM activity_submissions s JOIN class_activity_questions q ON q.activity_id = s.activity_id JOIN class_activities c ON c.id = s.activity_id;
INSERT INTO exercise_question_results (attempt_id, question_id, activity_id, question_points, class_id, student_user_id, source_exercise_id, scoring, result, points, nature, decided_by_id, decided_at, updated_at) VALUES
 ('00000000-0000-4000-8000-0000000ac004', '00000000-0000-4000-8000-0000000ab003', '00000000-0000-4000-8000-0000000aa003', 30, '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-000000000051', '00000000-0000-4000-8000-00000000ee01', true, 'CORRECT', 30, 'HUMAN_DECISION', '00000000-0000-4000-8000-0000000000a1', now(), now());
-- invitations: the same e-mail pending in cA1 (expires first) and cB1; one in cC1 (2027)
INSERT INTO class_invitations (id, class_id, email, token_hash, status, expires_at, last_sent_at, invited_by_id, updated_at) VALUES
 ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c0a1', 'novo@example.test', encode(sha256(convert_to('transicao027-convite-a1-xxxxxxxxxxxxxxxxxxx', 'UTF8')), 'hex'), 'PENDING', now() + interval '3 days', now(), '00000000-0000-4000-8000-0000000000a1', now()),
 ('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000c0b1', 'novo@example.test', encode(sha256(convert_to('transicao027-convite-b1-xxxxxxxxxxxxxxxxxxx', 'UTF8')), 'hex'), 'PENDING', now() + interval '7 days', now(), '00000000-0000-4000-8000-0000000000b1', now()),
 ('00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000c0c1', 'outro@example.test', encode(sha256(convert_to('transicao027-convite-c1-xxxxxxxxxxxxxxxxxxx', 'UTF8')), 'hex'), 'PENDING', now() + interval '5 days', now(), '00000000-0000-4000-8000-0000000000c1', now());
INSERT INTO mail_deliveries (kind, class_invitation_id, status, next_attempt_at, updated_at) VALUES
 ('CLASS_INVITATION', '00000000-0000-4000-8000-00000000d001', 'PENDING', now(), now()),
 ('CLASS_INVITATION', '00000000-0000-4000-8000-00000000d002', 'PENDING', now(), now());
INSERT INTO audit_events (type, actor_type, actor_user_id, target_type, target_id, metadata) VALUES
 ('class.created', 'USER', '00000000-0000-4000-8000-0000000000a1', 'CLASS', '00000000-0000-4000-8000-00000000c0a1', '{}'),
 ('class.created', 'USER', '00000000-0000-4000-8000-0000000000b1', 'CLASS', '00000000-0000-4000-8000-00000000c0b1', '{}');
