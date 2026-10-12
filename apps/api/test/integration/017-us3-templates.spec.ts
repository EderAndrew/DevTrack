import { createTransport } from "nodemailer";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AdminBootstrapService } from "../../src/modules/admin-bootstrap/admin-bootstrap.service";
import type { MailMessage } from "../../src/platform/mail/mailer";
import { composeMail } from "../../src/platform/mail/smtp.mailer";
import { escapeHtml } from "../../src/platform/mail/templates/escape-html";
import { mailContent, renderTemplate, type TemplateName, type TemplateParams } from "../../src/platform/mail/templates";
import { MAIL_TOKENS } from "../../src/platform/mail/templates/mail-tokens";
import { createClass, createUser, loginAs, type TestUser, uniqueEmail } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

/**
 * 017/US3 (research N9, contracts/web-ui.md "E-mails"): the six e-mails come from one source per
 * kind, rendered as an e-mail-safe HTML body and a text body with the same content, with nothing
 * loaded from outside the message and every value escaped in the HTML.
 */

const ORIGIN = "https://devtrack.example";
const LINK = `${ORIGIN}/convite?token=abc_DEF-123`;
const EXPIRES = new Date("2026-10-20T15:30:00.000Z");
/** Every kind of markup a name could bring: a script, an image with a handler, quotes, an entity, a template marker. */
const HOSTILE = `<script>alert(1)</script> <img src=x onerror=alert(2)> "aspas" & {{nome}}`;

type Sample = { [K in TemplateName]: [K, TemplateParams[K]] }[TemplateName];

/** The six kinds, with every variable value given by `value`. */
function samples(value: string): Sample[] {
  return [
    ["verify-email", { name: value, link: LINK }],
    ["password-reset", { name: value, link: LINK }],
    ["invitation-teacher", { displayName: value, link: LINK, expiresAt: EXPIRES }],
    ["invitation-manager", { displayName: value, link: LINK, expiresAt: EXPIRES }],
    ["admin-activation", { link: LINK, expiresAt: EXPIRES }],
    ["class-invitation", { className: value, classCode: value, period: value, teacherName: value, link: LINK, expiresAt: EXPIRES }],
  ];
}

const render = ([template, params]: Sample) => renderTemplate(template, params as never);
const content = ([template, params]: Sample) => mailContent(template, params as never);

/** The tags an e-mail body may have: layout tables, text and the one link. */
const ALLOWED_TAGS = new Set(["html", "head", "meta", "title", "body", "div", "table", "tr", "td", "h1", "p", "a", "br"]);

/** Problems of an HTML body against FR-020/FR-021 (an empty list passes), for a link of `origin`. */
function scan(html: string, origin: string): string[] {
  const problems: string[] = [];
  for (const [, tag] of html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)) {
    if (!ALLOWED_TAGS.has(tag!.toLowerCase())) problems.push(`tag <${tag}>`);
  }
  if (/<[^>]*\son[a-z]+\s*=/i.test(html)) problems.push("atributo de evento");
  // The markup only: text is escaped, so `src=` inside a name is not an attribute.
  const markup = [...html.matchAll(/<[^>]*>/g)].map((m) => m[0]).join("\n");
  for (const marker of ["src=", "url(", "@import", "background=", "<link", "<img", "<script", "<style"]) {
    if (markup.toLowerCase().includes(marker)) problems.push(marker);
  }
  for (const [url] of html.matchAll(/https?:\/\/[^\s"<>]+/g)) {
    const parsed = new URL(url.replace(/&amp;/g, "&"));
    if (parsed.origin !== origin) problems.push(`recurso externo ${parsed.origin}`);
    if ([...parsed.searchParams.keys()].some((key) => key !== "token")) problems.push(`parâmetro de rastreio em ${url}`);
  }
  for (const [, href] of html.matchAll(/href="([^"]*)"/g)) {
    if (!href!.startsWith(`${origin}/`)) problems.push(`link fora do DevTrack: ${href}`);
  }
  return problems;
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`cor não é #rrggbb: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = Number.parseInt(match[1]!.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG 2.2 contrast ratio, the computation of apps/web/test/contrast.test.ts. */
function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

describe("017/US3 e-mails com a cara do DevTrack", () => {
  describe.each(samples("Ana Souza").map((sample) => [sample[0], sample] as const))("modelo %s", (_name, sample) => {
    it("017/US3-1 017/FR-019 HTML e texto com o mesmo assunto, título, parágrafos, prazo e link", () => {
      const mail = render(sample);
      const source = content(sample);
      expect(mail.html).toContain(`<title>${escapeHtml(source.subject)}</title>`);
      for (const piece of [source.heading, ...source.paragraphs, source.expiry, source.action.label, source.reason]) {
        expect(mail.text).toContain(piece);
        expect(mail.html).toContain(escapeHtml(piece));
      }
      // The link written out in both, and the action's link the same.
      expect(mail.text).toContain(LINK);
      expect(mail.html).toContain(`>${LINK}</a>`);
      expect(mail.html).toContain(`href="${LINK}"`);
      expect(mail.text.match(/https?:\/\/\S+/)?.[0]).toBe(LINK);
      expect(mail.text).not.toMatch(/<[a-z]/i);
    });

    it("017/US3-3 017/FR-021 o HTML não busca nada fora da mensagem e não rastreia", () => {
      const { html } = render(sample);
      expect(scan(html, ORIGIN)).toEqual([]);
      for (const forbidden of ["<img", "<link", "<script", "@import", "url(", "src=", "utm_", "pixel"]) {
        expect(html.toLowerCase()).not.toContain(forbidden);
      }
    });

    it("017/US3-4 017/FR-022 lang pt-BR, ação como texto do link, preheader oculto", () => {
      const { html } = render(sample);
      const source = content(sample);
      expect(html).toMatch(/<html lang="pt-BR">/);
      expect(html).toContain(`>${escapeHtml(source.action.label)}</a>`);
      const preheader = /<div style="([^"]*)">([^<]*)<\/div>/.exec(html);
      expect(preheader?.[1]).toContain("display:none");
      expect(preheader?.[2]).toBe(escapeHtml(source.preheader));
      expect(source.preheader.length).toBeGreaterThan(0);
      expect(html).toMatch(/<meta name="viewport"/);
      // Layout tables are presentation for screen readers.
      for (const [table] of html.matchAll(/<table[^>]*>/g)) expect(table).toContain('role="presentation"');
    });
  });

  describe.each(samples(HOSTILE).map((sample) => [sample[0], sample] as const))("modelo %s com valores hostis", (_name, sample) => {
    it("017/US3-2 017/FR-020 o valor aparece escapado no HTML e literal no texto", () => {
      const mail = render(sample);
      if (sample[0] !== "admin-activation") {
        expect(mail.html).toContain(escapeHtml(HOSTILE));
        expect(mail.text).toContain(HOSTILE);
        // No template engine: a marker stays literal in both.
        expect(mail.html).toContain("{{nome}}");
      }
      expect(mail.html).not.toContain("<script");
      expect(mail.html).not.toContain("<img");
      expect(scan(mail.html, ORIGIN)).toEqual([]);
    });
  });

  it("017/US3-4 017/FR-022 as cores de mail-tokens.ts têm contraste ≥ 4.5 nos pares usados", () => {
    const pairs: Array<[string, string, string]> = [
      ["texto / cartão", MAIL_TOKENS.foreground, MAIL_TOKENS.surface],
      ["texto / fundo", MAIL_TOKENS.foreground, MAIL_TOKENS.background],
      ["texto secundário / cartão", MAIL_TOKENS.textSecondary, MAIL_TOKENS.surface],
      ["link / cartão", MAIL_TOKENS.primary, MAIL_TOKENS.surface],
      ["botão", MAIL_TOKENS.primaryForeground, MAIL_TOKENS.primary],
    ];
    for (const [name, foreground, background] of pairs) {
      expect(contrast(foreground, background), name).toBeGreaterThanOrEqual(4.5);
    }
    // Every colour of the HTML comes from the tokens.
    const { html } = render(samples("Ana")[0]!);
    const tokens = new Set<string>(Object.values(MAIL_TOKENS).map((hex) => hex.toLowerCase()));
    for (const [hex] of html.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) expect(tokens.has(hex.toLowerCase()), hex).toBe(true);
  });

  it("017/SC-005 a varredura dos seis passa: duas versões, mesmo conteúdo, zero recurso externo, zero rastreio, valores escapados", () => {
    const names = new Set<string>();
    for (const sample of [...samples("Ana Souza"), ...samples(HOSTILE)]) {
      names.add(sample[0]);
      const mail = render(sample);
      expect(mail.text.length, sample[0]).toBeGreaterThan(0);
      expect(mail.html.length, sample[0]).toBeGreaterThan(0);
      expect(scan(mail.html, ORIGIN), sample[0]).toEqual([]);
      expect(mail.text, sample[0]).toContain(LINK);
      expect(mail.html, sample[0]).toContain(`>${LINK}</a>`);
    }
    expect(names.size).toBe(6);
  });
});

describe("017/US3 os seis e-mails saem da API com HTML e texto", () => {
  let t: TestApp;
  let admin: TestUser;
  let manager: TestUser;
  let teacher: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
    admin = await createUser(t, { roles: ["ADMIN"], name: "Admin" });
    manager = await createUser(t, { roles: ["MANAGER"], name: "Gestora" });
    teacher = await createUser(t, { roles: ["TEACHER"], name: `Prof ${HOSTILE}`.slice(0, 120) });
  });

  /** Asks for each kind through the API (or the CLI's service) with hostile names where they fit. */
  const requests: Array<[TemplateName, () => Promise<string>]> = [
    [
      "verify-email",
      async () => {
        const user = await createUser(t, { verified: false, email: uniqueEmail("verificar"), name: HOSTILE });
        expect((await api(t).post("/api/auth/verify-email/resend", { email: user.email })).status).toBe(202);
        return user.email;
      },
    ],
    [
      "password-reset",
      async () => {
        const user = await createUser(t, { email: uniqueEmail("senha"), name: HOSTILE });
        expect((await api(t).post("/api/auth/password-reset/request", { email: user.email })).status).toBe(202);
        return user.email;
      },
    ],
    [
      "invitation-teacher",
      async () => {
        const email = uniqueEmail("prof");
        const res = await api(t, { cookie: await loginAs(t, manager) }).post("/api/teacher-invitations", { email, displayName: "Prof <b>&</b>" });
        expect(res.status).toBe(201);
        return email;
      },
    ],
    [
      "invitation-manager",
      async () => {
        const email = uniqueEmail("gestora");
        const res = await api(t, { cookie: await loginAs(t, admin) }).post("/api/manager-invitations", { email, displayName: "Gestora <b>&</b>" });
        expect(res.status).toBe(201);
        return email;
      },
    ],
    [
      "class-invitation",
      async () => {
        const email = uniqueEmail("aluno");
        const schoolClass = await createClass(t, teacher.id, { name: HOSTILE, period: "1º <i>semestre</i>" });
        const res = await api(t, { cookie: await loginAs(t, teacher) }).post(`/api/classes/${schoolClass.id}/invitations`, { email });
        expect(res.status).toBe(201);
        return email;
      },
    ],
    [
      "admin-activation",
      async () => {
        await t.prisma.userRole.deleteMany({ where: { role: { key: "ADMIN" } } });
        const email = uniqueEmail("primeira-admin");
        await t.get(AdminBootstrapService).run({ email, printLink: false, operator: { host: "teste", user: "op" } });
        return email;
      },
    ],
  ];

  it.each(requests)("017/US3-1 017/SC-005 %s chega ao mailer com HTML e texto, o mesmo link e nada de fora", async (template, request) => {
    const email = await request();
    await t.flushMail();
    const [mail] = t.mailer.messagesFor(email);
    expect(mail?.template).toBe(template);
    const link = t.mailer.lastLinkFor(email, template)!;
    expect(link.startsWith(`${t.config.webOrigin}/`)).toBe(true);
    expect(mail!.text).toContain(link);
    expect(mail!.html).toContain(`href="${link}"`);
    expect(mail!.html).toContain(`>${link}</a>`);
    expect(scan(mail!.html, new URL(t.config.webOrigin).origin)).toEqual([]);
    expect(mail!.html).not.toMatch(/<(script|b|i)>/);
  });

  describe("017/FR-023 remetente e resposta da configuração", () => {
    const message: MailMessage = { to: "aluno@example.test", template: "verify-email", params: { name: "Ana", link: LINK }, messageId: "<id.1@devtrack.test>" };

    it("017/FR-023 o remetente é o MAIL_FROM com o nome DevTrack, com HTML e texto numa só mensagem", async () => {
      const config = testConfig();
      expect(config.mailFrom).toMatch(/^DevTrack <[^<>@\s]+@[^<>\s]+>$/);
      const mail = composeMail(message, config);
      expect(mail.from).toBe(config.mailFrom);
      expect(mail.html).toContain(`href="${LINK}"`);
      expect(mail.text).toContain(LINK);
      expect(mail).not.toHaveProperty("replyTo");

      // The MIME nodemailer builds: one multipart/alternative with the text then the HTML.
      const info = await createTransport({ streamTransport: true, buffer: true }).sendMail(mail);
      const raw = (info.message as Buffer).toString("utf8");
      expect(raw).toMatch(/Content-Type: multipart\/alternative/);
      expect(raw.indexOf("Content-Type: text/plain")).toBeLessThan(raw.indexOf("Content-Type: text/html"));
      expect(raw).toMatch(/^From: DevTrack </m);
    });

    it("017/FR-023 o endereço de resposta vem de MAIL_REPLY_TO quando configurado", () => {
      const config = testConfig({ mail: { ...testConfig().mail, replyTo: "contato@devtrack.test" } });
      expect(composeMail(message, config).replyTo).toBe("contato@devtrack.test");
      expect(composeMail({ ...message, replyTo: "outro@devtrack.test" }, config).replyTo).toBe("outro@devtrack.test");
    });
  });
});
