import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { endpoints } from "@repo/contracts";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { API_ROOT } from "../helpers/env";
import { createClass, createClassInvitation, createUser, loginAs, type TestUser, uniqueEmail } from "../helpers/factories";
import { postNotice, resendSecretOf, signedResendNotice } from "../helpers/mail-notices";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const REPO_ROOT = resolve(API_ROOT, "../..");
const CONTRACT = resolve(REPO_ROOT, "specs/017-production-email/contracts/http-api.md");
/**
 * The routes whose answers carry an invitation's delivery situation (contracts/http-api.md, "Changed
 * shapes"): the three invitation lists and the teacher detail of ADMIN and gestor, which embeds the
 * teacher's `InvitationView` (001, `professores.visualizar`).
 */
const INVITATION_VIEWS = /^\/(classes\/:id\/invitations|teacher-invitations|manager-invitations|teachers\/:userId)(\/|$)/;

/** Every property name of a JSON Schema, at any depth. */
function propertyNames(schema: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) schema.forEach((item) => propertyNames(item, found));
  else if (schema && typeof schema === "object") {
    for (const [key, value] of Object.entries(schema)) {
      if (key === "properties" && value && typeof value === "object") Object.keys(value).forEach((name) => found.add(name));
      propertyNames(value, found);
    }
  }
  return found;
}

/** Source files of a directory, without tests and generated code. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : sources(path);
    return /\.ts$/.test(name) && !/\.spec\.ts$/.test(name) ? [path] : [];
  });
}

/**
 * 017 contracts/http-api.md and FR-030: the feature adds one route (the provider notices) and changes
 * only the invitation lists; the delivery situation follows the 001/003 permissions and the class's
 * context; the notice route never becomes a human session; a valid notice is answered fast; and
 * nothing outside the scope (new kinds, bulk sending, inbound mail, a suppression list, a provider SDK).
 */
describe("017 fronteiras do envio de e-mail", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ config: { rateLimit: { ...testConfig().rateLimit, mailNoticesPerMinute: 1_000 } } });
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  describe("rotas e respostas", () => {
    it("nenhuma rota além de POST /mail/notices/:provider é nova", () => {
      const contract = readFileSync(CONTRACT, "utf8");
      const documented = [...contract.matchAll(/^\| `(GET|POST|PUT|PATCH|DELETE) ([^`]+)` \|/gm)].map(([, method, path]) => `${method} ${path}`);
      expect(documented).toEqual(["POST /mail/notices/:provider"]);
      const mailRoutes = Object.values(endpoints)
        .filter((entry) => /\/(mail|notices?|deliver(y|ies)|bounces?|suppress\w*)(\/|$)/.test(entry.path))
        .map((entry) => `${entry.method} ${entry.path}`);
      expect(mailRoutes).toEqual(documented);
    });

    it("nenhuma resposta pública, de conta ou de /me tem delivery ou deliveryIssue; só as visões de convite", () => {
      const carriers: string[] = [];
      for (const [key, entry] of Object.entries(endpoints)) {
        // `null` (no body) and `"binary"` (files) are not schemas.
        if (!(entry.response instanceof z.ZodType)) continue;
        const names = propertyNames(z.toJSONSchema(entry.response as z.ZodType, { io: "output", unrepresentable: "any" }));
        if (names.has("delivery") || names.has("deliveryIssue")) carriers.push(`${key} ${entry.path}`);
      }
      expect(carriers.length).toBeGreaterThan(0);
      expect(carriers.filter((carrier) => !INVITATION_VIEWS.test(carrier.split(" ")[1]!))).toEqual([]);
    });

    it("a prévia pública de um convite não entregue e o /me do aluno não dizem nada do envio", async () => {
      const teacher = await createUser(t, { roles: ["TEACHER"] });
      const schoolClass = await createClass(t, teacher.id);
      const email = uniqueEmail("aluno-017");
      const { invitation, token } = await createClassInvitation(t, schoolClass.id, email);
      await t.prisma.mailDelivery.create({
        data: {
          kind: "CLASS_INVITATION",
          classInvitationId: invitation.id,
          status: "UNDELIVERED",
          undeliveredAt: new Date(),
          undeliveredReason: "BOUNCED",
        },
      });
      const preview = await api(t).post("/api/class-invitations/preview", { token });
      expect(preview.status).toBe(200);
      const student = await createUser(t, { roles: ["STUDENT"] });
      const studentClient = api(t, { cookie: await loginAs(t, student) });
      const bodies = [preview.body, (await studentClient.get("/api/me")).body, (await studentClient.get("/api/me/classes")).body];
      for (const body of bodies) expect(JSON.stringify(body)).not.toMatch(/"delivery(Issue)?"|UNDELIVERED|BOUNCED/);
    });
  });

  describe("quem vê a situação de envio", () => {
    let teacherA: TestUser;
    let classA: string;

    beforeEach(async () => {
      teacherA = await createUser(t, { roles: ["TEACHER"] });
      classA = (await createClass(t, teacherA.id)).id;
      const res = await api(t, { cookie: await loginAs(t, teacherA) }).post(`/api/classes/${classA}/invitations`, { email: uniqueEmail("aluno") });
      expect(res.status).toBe(201);
      await t.flushMail();
    });

    it("o professor B não vê os convites da turma de A (404); A vê a situação", async () => {
      const teacherB = await createUser(t, { roles: ["TEACHER"] });
      const own = await api(t, { cookie: await loginAs(t, teacherA) }).get(`/api/classes/${classA}/invitations`);
      expect(own.status).toBe(200);
      expect(JSON.stringify(own.body)).toMatch(/"delivery":"SENT"/);
      const other = await api(t, { cookie: await loginAs(t, teacherB) }).get(`/api/classes/${classA}/invitations`);
      expect(other.status).toBe(404);
      expect(JSON.stringify(other.body)).not.toMatch(/delivery/);
    });

    it("ADMIN, gestor e professor: as listas de convites seguem só as permissões de 001 e 003", async () => {
      const permissionsOf = async (role: string) =>
        new Set(
          (await t.prisma.rolePermission.findMany({ where: { role: { key: role } }, include: { permission: true } })).map((rp) => rp.permission.key),
        );
      for (const role of ["ADMIN", "MANAGER", "TEACHER"] as const) {
        const user = await createUser(t, { roles: [role] });
        const client = api(t, { cookie: await loginAs(t, user) });
        const granted = await permissionsOf(role);
        const teachers = await client.get("/api/teacher-invitations");
        expect(teachers.status, `${role} /teacher-invitations`).toBe(granted.has("professores.visualizar") ? 200 : 403);
        const managers = await client.get("/api/manager-invitations");
        expect(managers.status, `${role} /manager-invitations`).toBe(granted.has("managers.visualizar") ? 200 : 403);
        // Another teacher's class: outside the context (404) with the permission, 403 without it.
        const classInvitations = await client.get(`/api/classes/${classA}/invitations`);
        expect(classInvitations.status, `${role} turma de A`).toBe(granted.has("turmas.visualizar") ? 404 : 403);
      }
    });
  });

  describe("a rota de avisos", () => {
    it("Origin de fora e cookie de sessão: nenhuma sessão nova, nenhum cookie, nenhum ator humano na auditoria", async () => {
      const teacher = await createUser(t, { roles: ["TEACHER"] });
      const schoolClass = await createClass(t, teacher.id);
      const cookie = await loginAs(t, teacher);
      const invited = await api(t, { cookie }).post(`/api/classes/${schoolClass.id}/invitations`, { email: uniqueEmail("aluno") });
      await t.flushMail();
      const { messageId } = await t.prisma.mailDelivery.findFirstOrThrow({ where: { classInvitationId: invited.body.id } });
      const sessionsBefore = await t.prisma.session.count();
      const auditBefore = await t.prisma.auditEvent.count();

      const notice = signedResendNotice({ type: "email.bounced", messageId, secret: resendSecretOf(t.config), at: new Date() });
      const req = request(t.baseUrl).post("/api/mail/notices/resend").set("Origin", "https://evil.example").set("Cookie", cookie);
      for (const [name, value] of Object.entries(notice.headers)) req.set(name, value);
      const res = await req.send(notice.body);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
      expect(res.headers["set-cookie"]).toBeUndefined();
      expect(await t.prisma.session.count()).toBe(sessionsBefore);
      const written = await t.prisma.auditEvent.findMany({ skip: auditBefore, orderBy: { id: "asc" } });
      expect(written.map((event) => [event.type, event.actorType, event.actorUserId])).toEqual([["mail_delivery.undelivered", "SYSTEM", null]]);
    });

    it("desempenho: 100 avisos válidos com p95 < 200 ms", async () => {
      const user = await createUser(t, { roles: ["TEACHER"] });
      const sentAt = new Date();
      const ids = Array.from({ length: 100 }, () => randomUUID());
      await t.prisma.mailDelivery.createMany({
        data: ids.map((id) => ({
          id,
          kind: "VERIFY_EMAIL" as const,
          userId: user.id,
          status: "SENT" as const,
          attempts: 1,
          sentAt,
          messageId: `<${id}.1@${t.config.mail.messageIdDomain}>`,
        })),
      });
      const secret = resendSecretOf(t.config);
      // Warm-up: the first request pays for lazy initialisation.
      await postNotice(t, "resend", signedResendNotice({ type: "email.delivered", messageId: null, secret, at: new Date() }));

      const durations: number[] = [];
      for (const [index, id] of ids.entries()) {
        const type = index % 2 === 0 ? "email.delivered" : "email.bounced";
        const notice = signedResendNotice({ type, messageId: `<${id}.1@${t.config.mail.messageIdDomain}>`, secret, at: new Date() });
        const started = performance.now();
        const res = await postNotice(t, "resend", notice);
        durations.push(performance.now() - started);
        expect(res.status).toBe(200);
      }
      durations.sort((a, b) => a - b);
      const p95 = durations[Math.ceil(durations.length * 0.95) - 1]!;
      expect(p95, `p95 ${p95.toFixed(1)} ms`).toBeLessThan(200);
      expect(await t.prisma.mailDelivery.count({ where: { status: "DELIVERED" } })).toBe(50);
      expect(await t.prisma.mailDelivery.count({ where: { status: "UNDELIVERED" } })).toBe(50);
    });
  });

  describe("017/FR-030 fora do escopo", () => {
    it("017/FR-030 mail_kind tem exatamente os seis tipos", async () => {
      const rows = await t.prisma.$queryRaw<{ label: string }[]>`
        SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid
        WHERE ty.typname = 'mail_kind' ORDER BY e.enumlabel`;
      expect(rows.map((row) => row.label)).toEqual([
        "ADMIN_ACTIVATION",
        "CLASS_INVITATION",
        "INVITATION_MANAGER",
        "INVITATION_TEACHER",
        "PASSWORD_RESET",
        "VERIFY_EMAIL",
      ]);
    });

    it("017/FR-030 só o outbox chama o Mailer: nenhum e-mail sai fora da fila e dos seis tipos", () => {
      const src = resolve(API_ROOT, "src");
      const callers = sources(src)
        .filter((file) => /\bmailer\.send\(|\bsendMail\(/.test(readFileSync(file, "utf8")))
        .map((file) => relative(src, file))
        .sort();
      expect(callers).toEqual(["platform/mail/outbox/mail-outbox.ts", "platform/mail/smtp.mailer.ts"]);
    });

    it("017/FR-030 nenhum envio em lote: nenhuma rota de massa ou importação, e o convite de turma leva um endereço só", async () => {
      const bulk = Object.values(endpoints)
        .filter((entry) => /(bulk|import|batch|broadcast|newsletter|remind|digest)/i.test(entry.path) && /invit|mail/i.test(entry.path))
        .map((entry) => `${entry.method} ${entry.path}`);
      expect(bulk).toEqual([]);
      const teacher = await createUser(t, { roles: ["TEACHER"] });
      const schoolClass = await createClass(t, teacher.id);
      const client = api(t, { cookie: await loginAs(t, teacher) });
      const many = await client.post(`/api/classes/${schoolClass.id}/invitations`, { emails: [uniqueEmail("a"), uniqueEmail("b")] });
      expect(many.status).toBe(400);
      const list = await client.post(`/api/classes/${schoolClass.id}/invitations`, { email: [uniqueEmail("a"), uniqueEmail("b")] });
      expect(list.status).toBe(400);
      expect(await t.prisma.mailDelivery.count()).toBe(0);
    });

    it("017/FR-030 nenhuma tabela guarda endereço bloqueado nem conteúdo do e-mail", async () => {
      const tables = await t.prisma.$queryRaw<{ name: string }[]>`
        SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema()`;
      expect(tables.map((row) => row.name).filter((name) => /suppress|block|bounce|unsubscrib|blacklist|denylist|inbound|incoming/i.test(name))).toEqual([]);
      const columns = await t.prisma.$queryRaw<{ name: string }[]>`
        SELECT column_name AS name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name IN ('mail_deliveries', 'mail_notices')`;
      expect(columns.map((row) => row.name).filter((name) => /email|address|recipient|subject_line|^subject$|body|html|text|link|token|message$/i.test(name))).toEqual([]);
    });

    it("017/FR-030 nenhum receptor de e-mail e nenhuma biblioteca de provedor", () => {
      const forbidden = /^(resend|@aws-sdk\/.*|aws-sdk|@sendgrid\/.*|mailgun.*|postmark|smtp-server|mailparser|imap.*|node-imap|haraka.*|svix)$/;
      for (const workspace of ["apps/api", "apps/web", "packages/contracts"]) {
        const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, workspace, "package.json"), "utf8"));
        const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies });
        expect(deps.filter((dep) => forbidden.test(dep)), workspace).toEqual([]);
      }
      expect(Object.values(endpoints).filter((entry) => /inbound|incoming|reply|replies/i.test(entry.path))).toEqual([]);
    });
  });
});
