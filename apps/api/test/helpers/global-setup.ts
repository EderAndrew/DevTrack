import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { API_ROOT, loadTestEnv } from "./env";
import { compileSyllabusWorker } from "./syllabus-worker";

/** Runs once before all test files: generated client, migrations on postgres-test and the syllabus reading worker. */
export default function setup(): void {
  loadTestEnv();
  const prisma = resolve(API_ROOT, "node_modules/.bin/prisma");
  const run = (args: string[]) => {
    try {
      execFileSync(prisma, args, { cwd: API_ROOT, env: process.env, stdio: "pipe" });
    } catch (error) {
      const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
      process.stderr.write(`prisma ${args.join(" ")} failed:\n${stdout ?? ""}${stderr ?? ""}\n`);
      throw error;
    }
  };

  if (!existsSync(resolve(API_ROOT, "src/generated/prisma/client.ts"))) run(["generate"]);
  run(["migrate", "deploy"]);
  compileSyllabusWorker();
}
