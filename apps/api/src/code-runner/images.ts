import { PROFILES } from "./profiles";
import { pullImage } from "./sandbox/docker-sandbox";

/**
 * `pnpm --filter api code-runner:images` (019 research B5): pulls the pinned image of every profile,
 * so the first run doesn't wait for a download. Exit 1 if any pull fails.
 */
async function pullAll(): Promise<number> {
  let failed = 0;
  for (const profile of Object.values(PROFILES)) {
    process.stdout.write(`${profile.key}: ${profile.image}\n`);
    if ((await pullImage(profile.image)) !== 0) failed += 1;
  }
  return failed === 0 ? 0 : 1;
}

pullAll()
  .then((code) => process.exit(code))
  .catch(() => {
    process.stderr.write("Falha ao baixar as imagens do Code Runner (o Docker está rodando?).\n");
    process.exit(1);
  });
