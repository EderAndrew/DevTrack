import { describe, expect, it } from "vitest";
import { runProgram, sandbox, verdicts } from "./helpers";

/**
 * 019 research B4, B5 against the real `DockerSandbox` (`pnpm --filter api test:sandbox`): the three
 * profiles run a program that reads stdin and writes stdout — a right one, a wrong one, one that
 * doesn't compile and one that fails while running — with the case input as the program's exact
 * stdin (multibyte text included).
 */
const CASES = [
  { input: "1\n", expected: "2 ç\n" },
  { input: "21\n", expected: "42 ç\n" },
];

const PROGRAMS = {
  python: {
    right: "n = int(input())\nprint(n * 2, 'ç')\n",
    wrong: "n = int(input())\nprint(n * 3, 'ç')\n",
    broken: "print(\n",
    crash: "import sys\nprint('antes')\nsys.stdout.flush()\nraise ValueError('quebrou')\n",
  },
  javascript: {
    right: "const n = Number(require('fs').readFileSync(0, 'utf8').trim());\nconsole.log(`${n * 2} ç`);\n",
    wrong: "const n = Number(require('fs').readFileSync(0, 'utf8').trim());\nconsole.log(`${n * 3} ç`);\n",
    broken: "const = ;\n",
    crash: "console.log('antes');\nthrow new Error('quebrou');\n",
  },
  java: {
    right: "import java.util.Scanner;\npublic class Main {\n  public static void main(String[] a) {\n    int n = new Scanner(System.in).nextInt();\n    System.out.println((n * 2) + \" ç\");\n  }\n}\n",
    wrong: "import java.util.Scanner;\npublic class Main {\n  public static void main(String[] a) {\n    int n = new Scanner(System.in).nextInt();\n    System.out.println((n * 3) + \" ç\");\n  }\n}\n",
    broken: "public class Main { public static void main(String[] a) { int x = } }\n",
    crash: "public class Main {\n  public static void main(String[] a) {\n    System.out.println(\"antes\");\n    throw new RuntimeException(\"quebrou\");\n  }\n}\n",
  },
} as const;

describe("019 sandbox real: as três linguagens (research B4, B5)", () => {
  it("o daemon responde e os três perfis estão disponíveis (code-runner:images)", async () => {
    expect((await sandbox.profiles()).map((profile) => profile.key).sort()).toEqual(["java", "javascript", "python"]);
  });

  describe.each(Object.entries(PROGRAMS))("%s", (key, programs) => {
    const execution = key as keyof typeof PROGRAMS;

    it("019/US1-2 programa certo: os dois casos passam, com acentos na saída", async () => {
      const result = await runProgram(execution, programs.right, CASES);
      expect(verdicts(result)).toEqual(["PASSED", "PASSED"]);
    });

    it("019/US1-3 saída diferente: WRONG_OUTPUT com a saída obtida", async () => {
      const result = await runProgram(execution, programs.wrong, CASES);
      expect(verdicts(result)).toEqual(["WRONG_OUTPUT", "WRONG_OUTPUT"]);
      expect(result.compiled && result.cases[0]!.stdout).toBe("3 ç\n");
    });

    it("019/US1-4 erro de compilação ou de sintaxe: a mensagem e nenhum caso", async () => {
      const result = await runProgram(execution, programs.broken, CASES);
      expect(result.compiled).toBe(false);
      expect(!result.compiled && result.output.length).toBeGreaterThan(0);
    });

    it("019/US1-5 erro de execução: RUNTIME_ERROR com a saída até ali e a saída de erro", async () => {
      const result = await runProgram(execution, programs.crash, CASES.slice(0, 1));
      expect(verdicts(result)).toEqual(["RUNTIME_ERROR"]);
      const [only] = result.compiled ? result.cases : [];
      expect(only!.stdout).toBe("antes\n");
      expect(only!.stderr).toContain("quebrou");
    });
  });

  it("019 Java com a classe de outro nome: erro de compilação que cita a classe exigida", async () => {
    const result = await runProgram("java", "public class Solucao { public static void main(String[] a) {} }\n", CASES.slice(0, 1));
    expect(result.compiled).toBe(false);
    expect(!result.compiled && result.output).toMatch(/Solucao/);
  });

  it("019 a entrada do caso é exatamente o stdin do programa (sem o enquadramento)", async () => {
    const result = await runProgram("python", "import sys\nsys.stdout.write(sys.stdin.read())\n", [{ input: "linha 1\nção ✓\n\nfim", expected: "linha 1\nção ✓\n\nfim" }]);
    expect(verdicts(result)).toEqual(["PASSED"]);
    expect(result.compiled && result.cases[0]!.stdout).toBe("linha 1\nção ✓\n\nfim");
  });
});
