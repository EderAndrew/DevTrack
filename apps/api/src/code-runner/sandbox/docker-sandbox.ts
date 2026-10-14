import { spawn } from "node:child_process";

// The only file that starts processes (019 research B15, `code-runner-boundary.spec.ts`): the Docker
// CLI, with its arguments as a list and never through a shell of the host. `DockerSandbox` (one
// hardened container per step, research B3, B4) arrives with US1.

/** `docker pull <image>` (`pnpm --filter api code-runner:images`); resolves with the exit code. */
export function pullImage(image: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["pull", image], { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}
