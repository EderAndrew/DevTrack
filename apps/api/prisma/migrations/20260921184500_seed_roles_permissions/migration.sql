-- Reference data: roles, permissions and their associations, exactly as
-- specs/001-foundation-identity-access/contracts/permissions.md.
-- Idempotent. Never creates users or credentials (Constituição XXV, FR-033).

INSERT INTO "roles" ("key", "name", "privileged") VALUES
  ('ADMIN',   'Administrador', true),
  ('MANAGER', 'Gestor de Cadastros', true),
  ('TEACHER', 'Professor', true),
  ('STUDENT', 'Aluno', false)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "permissions" ("key", "description") VALUES
  ('sessoes.proprias.listar',      'Listar e consultar as próprias sessões ativas'),
  ('sessoes.proprias.revogar',     'Revogar uma sessão própria específica'),
  ('professores.visualizar',       'Ver cadastro docente (nome, e-mail, status do papel TEACHER, convites)'),
  ('professores.convidar',         'Criar convite de professor'),
  ('professores.reenviar_convite', 'Reenviar convite de professor pendente'),
  ('professores.revogar_convite',  'Revogar convite de professor pendente'),
  ('professores.suspender',        'Suspender o papel TEACHER'),
  ('professores.desativar',        'Desativar o papel TEACHER'),
  ('professores.ativar',           'Reativar o papel TEACHER'),
  ('managers.visualizar',          'Ver MANAGERs e convites de MANAGER'),
  ('managers.convidar',            'Criar convite de MANAGER'),
  ('managers.reenviar_convite',    'Reenviar convite de MANAGER pendente'),
  ('managers.revogar_convite',     'Revogar convite de MANAGER pendente'),
  ('managers.desativar',           'Desativar o papel MANAGER'),
  ('managers.ativar',              'Reativar o papel MANAGER'),
  ('usuarios.visualizar',          'Consulta de contas em nível de identidade (FR-056)'),
  ('usuarios.suspender',           'Suspender conta (User)'),
  ('usuarios.reativar',            'Reativar conta (User)')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
  ('ADMIN', 'sessoes.proprias.listar'),
  ('ADMIN', 'sessoes.proprias.revogar'),
  ('ADMIN', 'professores.visualizar'),
  ('ADMIN', 'professores.convidar'),
  ('ADMIN', 'professores.reenviar_convite'),
  ('ADMIN', 'professores.revogar_convite'),
  ('ADMIN', 'professores.suspender'),
  ('ADMIN', 'professores.desativar'),
  ('ADMIN', 'professores.ativar'),
  ('ADMIN', 'managers.visualizar'),
  ('ADMIN', 'managers.convidar'),
  ('ADMIN', 'managers.reenviar_convite'),
  ('ADMIN', 'managers.revogar_convite'),
  ('ADMIN', 'managers.desativar'),
  ('ADMIN', 'managers.ativar'),
  ('ADMIN', 'usuarios.visualizar'),
  ('ADMIN', 'usuarios.suspender'),
  ('ADMIN', 'usuarios.reativar'),
  ('MANAGER', 'sessoes.proprias.listar'),
  ('MANAGER', 'sessoes.proprias.revogar'),
  ('MANAGER', 'professores.visualizar'),
  ('MANAGER', 'professores.convidar'),
  ('MANAGER', 'professores.reenviar_convite'),
  ('MANAGER', 'professores.revogar_convite'),
  ('MANAGER', 'professores.suspender'),
  ('MANAGER', 'professores.desativar'),
  ('MANAGER', 'professores.ativar'),
  ('TEACHER', 'sessoes.proprias.listar'),
  ('TEACHER', 'sessoes.proprias.revogar'),
  ('STUDENT', 'sessoes.proprias.listar'),
  ('STUDENT', 'sessoes.proprias.revogar')
) AS seed ("role_key", "permission_key")
JOIN "roles" r ON r."key" = seed."role_key"
JOIN "permissions" p ON p."key" = seed."permission_key"
ON CONFLICT DO NOTHING;
