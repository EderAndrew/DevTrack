import { createHmac, randomUUID } from "node:crypto";
import { type Locator, type Page, expect, test } from "@playwright/test";
import { API_URL, e2eEnv } from "./env.ts";
import { uniqueEmail } from "./fixtures/emails.ts";
import { classTeacher, inviteToClass, logIn } from "./fixtures/journeys.ts";
import { waitForMessages } from "./fixtures/mailpit.ts";

/** Presses Tab until `target` has the focus (reading the focus is only an observation). */
async function tabTo(page: Page, target: Locator, maxPresses = 60): Promise<void> {
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Foco não chegou ao alvo em ${maxPresses} Tabs.`);
}

/**
 * Posts a Resend `email.bounced` notice for `messageId` to the E2E API, signed with the
 * `MAIL_NOTICE_SECRET` of `.env.e2e` as Svix signs it (017 research N6, N14): no Origin, no cookie.
 */
async function postBounce(messageId: string): Promise<number> {
  const secret = Buffer.from(e2eEnv.MAIL_NOTICE_SECRET!.replace(/^whsec_/, ""), "base64");
  const id = `msg_${randomUUID().replaceAll("-", "")}`;
  const now = new Date();
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const body = JSON.stringify({
    type: "email.bounced",
    created_at: now.toISOString(),
    data: {
      created_at: now.toISOString(),
      email_id: randomUUID(),
      message_id: `<${messageId}>`,
      bounce: { type: "Permanent", subType: "General", message: "Mailbox does not exist" },
    },
  });
  const signature = createHmac("sha256", secret).update(`${id}.${timestamp}.${body}`).digest("base64");
  const response = await fetch(`${API_URL}/api/mail/notices/resend`, {
    method: "POST",
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` },
    body,
  });
  return response.status;
}

test("017/US3-1 017/US2-1 017/US2-4 convite em HTML e texto, aviso de bounce, \"Não entregue\" e reenvio confirmado, pelo teclado", async ({
  page,
  browser,
}) => {
  const email = uniqueEmail("nao-entregue");
  await inviteToClass(browser, { email });

  // 017/US3-1: the e-mail has a visual and a text version with the same link, and no external image.
  const [invitationMail] = await waitForMessages(email, 1);
  const textLinks = invitationMail!.Text.match(/https?:\/\/\S+\/convite-turma\?token=[\w-]+/g) ?? [];
  expect(textLinks).toHaveLength(1);
  expect(invitationMail!.HTML).toContain(`href="${textLinks[0]!.replaceAll("&", "&amp;")}"`);
  expect(invitationMail!.HTML).not.toMatch(/<img\b[^>]*\bsrc=["']?https?:/i);
  expect(invitationMail!.HTML).not.toMatch(/url\(\s*["']?https?:|<link\b|<script\b/i);

  // The provider says the address does not exist (017/US2-1).
  expect(await postBounce(invitationMail!.MessageID)).toBe(200);

  const teacher = classTeacher();
  await logIn(page, teacher, `/turmas/${teacher.classId}/convites`);
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row.getByText("Não entregue", { exact: true })).toBeVisible();
  await expect(row.getByText("O endereço não existe ou recusou a mensagem.")).toBeVisible();

  // 017/US2-4: "Reenviar" asks first; "Voltar" sends nothing; everything by the keyboard.
  const resend = row.getByRole("button", { name: `Reenviar convite para ${email}` });
  await tabTo(page, resend);
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("alertdialog", { name: "Reenviar para o mesmo endereço?" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText("Este endereço já recusou a mensagem. Confira o e-mail antes de reenviar.")).toBeVisible();
  await tabTo(page, confirm.getByRole("button", { name: "Voltar" }));
  await page.keyboard.press("Enter");
  await expect(confirm).toBeHidden();
  await expect(resend).toBeFocused();
  await expect(row.getByText("Não entregue", { exact: true })).toBeVisible();
  // Nothing was resent: still one e-mail, a second could only come from a resend.
  await page.waitForTimeout(1_000);
  expect(await waitForMessages(email, 1)).toHaveLength(1);

  await page.keyboard.press("Enter");
  await expect(confirm).toBeVisible();
  await tabTo(page, confirm.getByRole("button", { name: "Reenviar" }));
  await page.keyboard.press("Enter");
  await expect(page.getByText("Convite reenviado.")).toBeVisible();
  await waitForMessages(email, 2);
  await expect(row.getByText("Não entregue", { exact: true })).toBeHidden();
});
