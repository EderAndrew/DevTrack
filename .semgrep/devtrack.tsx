// Positive and negative cases of .semgrep/devtrack.yml, read only by `semgrep --test`; never compiled or run.
// ruleid: devtrack-child-process-only-in-sandbox
import { spawn } from "node:child_process";
// ruleid: devtrack-child-process-only-in-sandbox
import { exec } from "child_process";
// ok: devtrack-child-process-only-in-sandbox
import { createHash, createHmac } from "node:crypto";

export function html(value: string, el: any) {
  // ok: devtrack-no-html-injection
  const text = <div>{value}</div>;
  // ok: devtrack-no-html-injection
  el.textContent = value;
  // ruleid: devtrack-no-html-injection
  el.innerHTML = value;
  // ruleid: devtrack-no-html-injection
  el.insertAdjacentHTML("beforeend", value);
  // ruleid: devtrack-no-html-injection
  return [text, <div className="x" dangerouslySetInnerHTML={{ __html: value }} />];
}

export function code(value: string) {
  // ruleid: devtrack-no-dynamic-code
  eval(value);
  // ruleid: devtrack-no-dynamic-code
  new Function(value);
  // ok: devtrack-no-dynamic-code
  retrieval(value);
}

export async function sql(tx: any, id: string, update: boolean) {
  // ok: devtrack-no-dynamic-raw-sql
  await tx.$queryRaw`SELECT * FROM users WHERE id = ${id}`;
  // ok: devtrack-no-dynamic-raw-sql
  await tx.$executeRawUnsafe("SET LOCAL devtrack.mail_purge = 'on'");
  // ok: devtrack-no-dynamic-raw-sql
  Prisma.raw(update ? "FOR UPDATE" : "FOR SHARE");
  // ruleid: devtrack-no-dynamic-raw-sql
  await tx.$queryRawUnsafe("SELECT * FROM users WHERE id = " + id);
  // ruleid: devtrack-no-dynamic-raw-sql
  await tx.$executeRawUnsafe(`DELETE FROM users WHERE id = ${id}`);
  // ruleid: devtrack-no-dynamic-raw-sql
  Prisma.raw(id);
}

export function hash(crypto: any, value: string) {
  // ok: devtrack-no-weak-hash
  createHash("sha256").update(value);
  // ruleid: devtrack-no-weak-hash
  createHash("md5").update(value);
  // ruleid: devtrack-no-weak-hash
  crypto.createHash("sha1").update(value);
  // ruleid: devtrack-no-weak-hash
  createHmac("SHA1", value);
}

declare const Prisma: any;
declare function retrieval(value: string): void;
export const processes = [spawn, exec];
