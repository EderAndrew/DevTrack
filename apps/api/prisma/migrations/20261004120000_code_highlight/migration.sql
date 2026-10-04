-- 014 — Code syntax highlighting (specs/014-code-syntax-highlighting/data-model.md, research L3).
-- Each catalog language carries the grammar key the web uses to color its code; NULL = plain
-- text. Frameworks take the grammar of the language they're written in. Idempotent.

ALTER TABLE "programming_languages" ADD COLUMN "highlight" TEXT;

ALTER TABLE "programming_languages" ADD CONSTRAINT "programming_languages_highlight_chk"
  CHECK ("highlight" ~ '^[a-z][a-z0-9-]{0,31}$');

UPDATE "programming_languages" AS l SET "highlight" = v."highlight"
FROM (VALUES
  ('angular',    'typescript'),
  ('c',          'cpp'),
  ('cpp',        'cpp'),
  ('go',         'go'),
  ('html-css',   'html'),
  ('java',       'java'),
  ('javascript', 'javascript'),
  ('nest',       'typescript'),
  ('node',       'javascript'),
  ('php',        'php'),
  ('python',     'python'),
  ('rust',       'rust'),
  ('typescript', 'typescript')
) AS v("key", "highlight")
WHERE l."key" = v."key";
