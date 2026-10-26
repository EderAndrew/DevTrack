import type { CodeHighlight } from "@repo/contracts";

/**
 * Examples in the empty fields of a CODE exercise in "Criar manualmente" and "Novo exercício": one
 * small exercise (add two integers read from the input) shown as each field's placeholder, never
 * saved. The code examples follow the grammar key of the chosen language (`language.highlight`),
 * never a catalog language; any other key, or none, gets a text with no code.
 */
export interface CodeExerciseExamples {
  statement: string;
  instructions: string;
  starterCode: string;
  expectedSolution: string;
  explanation: string;
  testCases: { input: string; expectedOutput: string };
}

const STATEMENT = "Ex.: Escreva um programa que leia dois números inteiros e mostre a soma deles.";
const INSTRUCTIONS =
  "Ex.: Leia os dois números da entrada padrão, separados por um espaço, e imprima apenas o resultado, sem texto extra.";
const EXPLANATION = "Ex.: Basta ler os dois valores, convertê-los para inteiros e imprimir a soma com uma única saída.";
const TEST_CASES = { input: "Ex.: 2 3", expectedOutput: "Ex.: 5" };

interface CodeExample {
  starterCode: string;
  expectedSolution: string;
}

const CODE: Partial<Record<NonNullable<CodeHighlight>, CodeExample>> = {
  python: {
    starterCode: "a, b = map(int, input().split())\n# Escreva sua solução aqui",
    expectedSolution: "a, b = map(int, input().split())\nprint(a + b)",
  },
  java: {
    starterCode:
      "import java.util.Scanner;\n\npublic class Main {\n  public static void main(String[] args) {\n    Scanner in = new Scanner(System.in);\n    // Escreva sua solução aqui\n  }\n}",
    expectedSolution:
      "import java.util.Scanner;\n\npublic class Main {\n  public static void main(String[] args) {\n    Scanner in = new Scanner(System.in);\n    int a = in.nextInt();\n    int b = in.nextInt();\n    System.out.println(a + b);\n  }\n}",
  },
  javascript: {
    starterCode: 'const [a, b] = require("fs").readFileSync(0, "utf8").trim().split(" ").map(Number);\n// Escreva sua solução aqui',
    expectedSolution: 'const [a, b] = require("fs").readFileSync(0, "utf8").trim().split(" ").map(Number);\nconsole.log(a + b);',
  },
};

const WITHOUT_LANGUAGE: CodeExample = {
  starterCode: "Ex.: o começo do programa que o aluno recebe pronto. Escolha a linguagem para ver um exemplo.",
  expectedSolution: "Ex.: o programa completo que resolve o exercício. Escolha a linguagem para ver um exemplo.",
};

export function codeExerciseExamples(highlight: CodeHighlight): CodeExerciseExamples {
  const code = (highlight && Object.hasOwn(CODE, highlight) && CODE[highlight]) || WITHOUT_LANGUAGE;
  return { statement: STATEMENT, instructions: INSTRUCTIONS, explanation: EXPLANATION, testCases: TEST_CASES, ...code };
}
