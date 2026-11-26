-- 031 — calendar day kinds (specs/031-calendar-day-kinds/data-model.md, research CK1, CK2, CK13).
-- `class_meetings` keeps meaning "encontro" and gains a kind and a description; the days that are not encontros live
-- in `class_calendar_days`. One mark per date of a class across both tables (cross-table triggers).

-- ---------------------------------------------------------------------------
-- (1) enums
-- ---------------------------------------------------------------------------
CREATE TYPE "class_meeting_kind" AS ENUM ('CLASS', 'EXAM', 'ASSIGNMENT', 'REVIEW', 'MAKEUP');
CREATE TYPE "class_calendar_day_kind" AS ENUM ('HOLIDAY', 'RECESS', 'SPECIAL_EVENT', 'TEACHER_ABSENCE');

-- ---------------------------------------------------------------------------
-- (2) class_meetings: kind (every existing row becomes CLASS, FR-011) and description
-- ---------------------------------------------------------------------------
ALTER TABLE "class_meetings"
  ADD COLUMN "kind" "class_meeting_kind" NOT NULL DEFAULT 'CLASS',
  ADD COLUMN "description" TEXT;

ALTER TABLE "class_meetings"
  ADD CONSTRAINT "class_meetings_description_by_kind" CHECK (("kind" = 'CLASS') = ("description" IS NULL)),
  ADD CONSTRAINT "class_meetings_description_length"
    CHECK ("description" IS NULL OR char_length(btrim("description")) BETWEEN 1 AND 120);

-- ---------------------------------------------------------------------------
-- (3) class_calendar_days: the days that are not encontros, per disciplina da turma (FR-013)
-- ---------------------------------------------------------------------------
CREATE TABLE "class_calendar_days" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "class_id"       UUID NOT NULL,
  "day_date"       DATE NOT NULL,
  "kind"           "class_calendar_day_kind" NOT NULL,
  "description"    TEXT,
  "absence_reason" TEXT,
  "absence_notice" TEXT,
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "class_calendar_days_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "class_calendar_days_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  -- HOLIDAY, RECESS and SPECIAL_EVENT: a description, no reason or notice.
  CONSTRAINT "class_calendar_days_described" CHECK (
    "kind" = 'TEACHER_ABSENCE'
    OR ("description" IS NOT NULL AND "absence_reason" IS NULL AND "absence_notice" IS NULL)
  ),
  -- TEACHER_ABSENCE: a private reason, an optional notice, no description.
  CONSTRAINT "class_calendar_days_absence" CHECK (
    "kind" <> 'TEACHER_ABSENCE' OR ("description" IS NULL AND "absence_reason" IS NOT NULL)
  ),
  CONSTRAINT "class_calendar_days_description_length"
    CHECK ("description" IS NULL OR char_length(btrim("description")) BETWEEN 1 AND 120),
  CONSTRAINT "class_calendar_days_reason_length"
    CHECK ("absence_reason" IS NULL OR char_length(btrim("absence_reason")) BETWEEN 1 AND 500),
  CONSTRAINT "class_calendar_days_notice_length"
    CHECK ("absence_notice" IS NULL OR char_length(btrim("absence_notice")) BETWEEN 1 AND 200)
);

CREATE UNIQUE INDEX "class_calendar_days_class_id_day_date_key" ON "class_calendar_days" ("class_id", "day_date");

-- ---------------------------------------------------------------------------
-- (4) one mark per date of a class across both tables (CK2). The service saves under the class lock and deletes
-- before it inserts, so a date moving from one table to the other never trips these.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "class_meetings_date_free"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "class_calendar_days" d
              WHERE d."class_id" = NEW."class_id" AND d."day_date" = NEW."meeting_date") THEN
    RAISE EXCEPTION 'date % of class % is already a calendar day', NEW."meeting_date", NEW."class_id"
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "class_meetings_date_free"
  BEFORE INSERT OR UPDATE OF "meeting_date", "class_id" ON "class_meetings"
  FOR EACH ROW EXECUTE FUNCTION "class_meetings_date_free"();

CREATE FUNCTION "class_calendar_days_date_free"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "class_meetings" m
              WHERE m."class_id" = NEW."class_id" AND m."meeting_date" = NEW."day_date") THEN
    RAISE EXCEPTION 'date % of class % is already a meeting', NEW."day_date", NEW."class_id"
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "class_calendar_days_date_free"
  BEFORE INSERT OR UPDATE OF "day_date", "class_id" ON "class_calendar_days"
  FOR EACH ROW EXECUTE FUNCTION "class_calendar_days_date_free"();

-- ---------------------------------------------------------------------------
-- (5) permissions (data-model.md "Permissions", CK13): the student's calendar, STUDENT only
-- ---------------------------------------------------------------------------
INSERT INTO "permissions" ("key", "description") VALUES
  ('calendario.turma.visualizar', 'Ver o calendário das disciplinas das próprias turmas')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" = 'calendario.turma.visualizar'
WHERE r."key" = 'STUDENT'
ON CONFLICT DO NOTHING;
