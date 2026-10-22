import { escapeHtml } from "./escape-html";
import { MAIL_TOKENS as c } from "./mail-tokens";

/**
 * What one e-mail says, written once per kind (017 research N9): `layout` renders both bodies from
 * it, so the HTML and the text never drift (017/FR-019). Values are plain text, never markup.
 */
export interface MailContent {
  subject: string;
  /** The line clients show after the subject in the inbox; hidden in the body. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  /** The one action: a link styled as a button and written out (017/FR-022). */
  action: { label: string; url: string };
  /** Until when the link works. */
  expiry: string;
  /** Why this address got the e-mail, opening the footer. */
  reason: string;
}

export interface RenderedMail {
  subject: string;
  text: string;
  /** Every value is escaped; nothing is loaded from outside the message (017/FR-020, FR-021). */
  html: string;
}

const IGNORE = "Se você não esperava esta mensagem, ignore-a.";
const SIGNATURE = "— DevTrack";
const LINK_HINT = "Se o botão não funcionar, copie e cole este endereço no navegador:";

/** The system font stack: no web font to download (017/FR-021). */
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const TEXT = `font-family:${FONT};font-size:16px;line-height:24px;color:${c.foreground};`;
const SMALL = `font-family:${FONT};font-size:14px;line-height:20px;color:${c.textSecondary};`;

const row = (inner: string, padding = "16px 32px 0") => `<tr><td style="padding:${padding};">${inner}</td></tr>`;
const paragraph = (text: string, style = TEXT) => `<p style="margin:0;${style}">${escapeHtml(text)}</p>`;

function renderText(content: MailContent): string {
  return [
    "DevTrack",
    content.heading,
    ...content.paragraphs,
    `${content.action.label}: ${content.action.url}`,
    content.expiry,
    `${content.reason} ${IGNORE}\n${SIGNATURE}`,
  ].join("\n\n");
}

/**
 * Tables and inline styles only, the layout e-mail clients agree on; one centred card of at most
 * 560 px that narrows on a phone. Light-theme token colours (research N9).
 */
function renderHtml(content: MailContent): string {
  const url = escapeHtml(content.action.url);
  const rows = [
    row(`<p style="margin:0;font-family:${FONT};font-size:18px;line-height:24px;font-weight:700;color:${c.primary};">DevTrack</p>`, "24px 32px 0"),
    row(`<h1 style="margin:0;font-family:${FONT};font-size:22px;line-height:28px;font-weight:700;color:${c.foreground};">${escapeHtml(content.heading)}</h1>`),
    ...content.paragraphs.map((text) => row(paragraph(text))),
    row(
      `<a href="${url}" style="display:inline-block;padding:12px 24px;border-radius:6px;background-color:${c.primary};` +
        `font-family:${FONT};font-size:16px;line-height:24px;font-weight:600;color:${c.primaryForeground};text-decoration:none;">` +
        `${escapeHtml(content.action.label)}</a>`,
      "24px 32px 0",
    ),
    row(
      `<p style="margin:0;${SMALL}">${escapeHtml(LINK_HINT)}<br>` +
        `<a href="${url}" style="color:${c.primary};word-break:break-all;">${url}</a></p>`,
    ),
    row(paragraph(content.expiry, SMALL)),
    row(
      `<p style="margin:0;padding-top:16px;border-top:1px solid ${c.border};${SMALL}">` +
        `${escapeHtml(content.reason)} ${escapeHtml(IGNORE)}<br>${escapeHtml(SIGNATURE)}</p>`,
      "24px 32px 24px",
    ),
  ];
  return [
    "<!doctype html>",
    '<html lang="pt-BR">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="color-scheme" content="dark"><title>${escapeHtml(content.subject)}</title></head>`,
    `<body style="margin:0;padding:0;background-color:${c.background};">`,
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${c.background};">`,
    '<tr><td align="center" style="padding:24px 16px;">',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:${c.surface};border:1px solid ${c.border};border-radius:8px;">`,
    ...rows,
    "</table>",
    "</td></tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("\n");
}

/** Both bodies of one e-mail from its content. */
export function layout(content: MailContent): RenderedMail {
  return { subject: content.subject, text: renderText(content), html: renderHtml(content) };
}
