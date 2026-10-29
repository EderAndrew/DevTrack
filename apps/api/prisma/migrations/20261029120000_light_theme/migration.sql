-- 022 — Tema claro opcional (specs/022-light-theme/data-model.md, research Z1).
-- The account's theme: a visual preference, no trigger and no audit (FR-015). Every existing account
-- keeps the dark theme (FR-003).
CREATE TYPE "ui_theme" AS ENUM ('DARK', 'LIGHT');

ALTER TABLE "users" ADD COLUMN "theme" "ui_theme" NOT NULL DEFAULT 'DARK';
