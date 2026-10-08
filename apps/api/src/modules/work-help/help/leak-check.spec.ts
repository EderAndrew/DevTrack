import { describe, expect, it } from "vitest";
import {
  checkLeak,
  type LeakCheckKey,
  MIN_ALTERNATIVE_CHARS,
  MIN_SOLUTION_LINE_CHARS,
  MIN_WHOLE_ANSWER_CHARS,
  normalizeText,
  SHINGLE_TOKENS,
  SOLUTION_RUN_LINES,
} from "./leak-check";

const guidance = (message: string, example: string | null = null) => ({ message, example });

describe("015/FR-018 checagem de vazamento das orientações (research F10)", () => {
  it("normaliza caixa, acentos, pontuação e espaços", () => {
    expect(normalizeText("  Ação,   ÍNDICE!\n(Opção)  já-é ")).toBe("acao indice opcao ja e");
  });

  it("os limiares são os da research F10", () => {
    expect({ MIN_ALTERNATIVE_CHARS, MIN_WHOLE_ANSWER_CHARS, SHINGLE_TOKENS, SOLUTION_RUN_LINES, MIN_SOLUTION_LINE_CHARS }).toEqual({
      MIN_ALTERNATIVE_CHARS: 12,
      MIN_WHOLE_ANSWER_CHARS: 25,
      SHINGLE_TOKENS: 8,
      SOLUTION_RUN_LINES: 3,
      MIN_SOLUTION_LINE_CHARS: 8,
    });
  });

  describe("015/US3-3 Múltipla escolha: nenhuma alternativa indicada, eliminada ou ordenada", () => {
    const key: LeakCheckKey = {
      type: "MULTIPLE_CHOICE",
      alternatives: ["Encapsulamento protege o estado interno", "Herança múltipla", "Polimorfismo paramétrico", "Sim"],
    };
    const blocked = (message: string, example: string | null = null) => checkLeak(key, guidance(message, example));

    it.each([
      "A alternativa B está correta.",
      "Pense bem na alternativa c.",
      "A letra D pode ser descartada.",
      "Repare na letra b antes de decidir.",
      "Eu ficaria com a opção (E).",
      "A opção A parece a mais forte.",
      "Compare a Opção d com as outras.",
      "O item C não faz sentido.",
      "As alternativas A e C se parecem.",
      "Olhe com cuidado para (B) e (D).",
      "Analise assim:\nA) primeiro\nB) depois",
      "Passos:\n  (c) compare as definições",
      "A resposta é letra a).",
      "Escolha a alternativa (a).",
      "Leia o item e) de novo.",
    ])("rótulo de alternativa: %s", (message) => {
      expect(blocked(message)).toBe("MC_ALTERNATIVE_REFERENCED");
    });

    it("o rótulo também conta dentro do exemplo", () => {
      expect(blocked("Veja o exemplo.", "// a alternativa B")).toBe("MC_ALTERNATIVE_REFERENCED");
    });

    it("texto de qualquer alternativa com 12 caracteres ou mais, normalizado (certa ou errada)", () => {
      expect(blocked("Talvez ENCAPSULAMENTO protege o estado interno, não?")).toBe("MC_ALTERNATIVE_REFERENCED");
      expect(blocked("Será que é herança-múltipla?")).toBe("MC_ALTERNATIVE_REFERENCED");
      expect(blocked("Descarte o polimorfismo paramétrico.")).toBe("MC_ALTERNATIVE_REFERENCED");
    });

    it("alternativas curtas (menos de 12 caracteres) não bloqueiam pela palavra", () => {
      expect(blocked("Sim, faz sentido pensar no papel de cada classe.")).toBeNull();
    });

    it.each([
      "Pense no que cada conceito garante sobre o estado de um objeto.",
      "Leia cada item a seguir com calma e veja o que o enunciado pede.",
      "Uma alternativa errada costuma generalizar demais; leia a pergunta e anote o conceito-chave.",
      "Que diferença existe entre reaproveitar código e esconder detalhes internos?",
      "Releia o enunciado e a sua escolha: e se o atributo fosse público?",
      "1) Leia o enunciado. 2) Anote a palavra-chave. 3) Compare com a definição.",
      "A herança permite reaproveitar comportamento; o polimorfismo, tratar objetos diferentes de forma igual.",
    ])("orientação legítima não bloqueia: %s", (message) => {
      expect(blocked(message)).toBeNull();
    });
  });

  describe("015/US3-10 Pergunta e resposta: nem a resposta esperada nem trechos dela ou da explicação", () => {
    const key: LeakCheckKey = {
      type: "OPEN_ANSWER",
      statement: "Explique por que devemos impedir que outras partes do programa alterem o saldo de uma conta diretamente.",
      expectedAnswer: "Para que a classe valide cada mudança e o saldo nunca fique negativo ou inconsistente.",
      explanation: "O encapsulamento concentra as regras de alteração do estado em métodos da própria classe, que verificam os valores antes de gravar.",
    };

    it("a resposta esperada inteira (25 caracteres ou mais), normalizada", () => {
      expect(checkLeak(key, guidance("Resposta: PARA QUE A CLASSE VALIDE CADA MUDANÇA E O SALDO NUNCA FIQUE NEGATIVO OU INCONSISTENTE!"))).toBe(
        "EXPECTED_ANSWER_OVERLAP",
      );
    });

    it("8 palavras seguidas da resposta esperada", () => {
      expect(checkLeak(key, guidance("Dica: a classe valide cada mudança e o saldo nunca, certo?"))).toBe("EXPECTED_ANSWER_OVERLAP");
    });

    it("8 palavras seguidas da explicação", () => {
      expect(checkLeak(key, guidance("Lembre que as regras de alteração do estado em métodos da própria classe importam."))).toBe("EXPECTED_ANSWER_OVERLAP");
    });

    it("7 palavras seguidas não bastam", () => {
      expect(checkLeak(key, guidance("Pense: a classe valide cada mudança e o... será?"))).toBeNull();
    });

    it("trechos que o enunciado já mostra ao aluno não bloqueiam", () => {
      const repeating: LeakCheckKey = { ...key, expectedAnswer: "Devemos impedir que outras partes do programa alterem o saldo para manter as regras." };
      expect(checkLeak(repeating, guidance("O enunciado pergunta por que impedir que outras partes do programa alterem o saldo. O que pode dar errado?"))).toBeNull();
    });

    it("resposta esperada curta só bloqueia por trechos de 8 palavras", () => {
      const short: LeakCheckKey = { ...key, expectedAnswer: "Encapsulamento.", explanation: null };
      expect(checkLeak(short, guidance("Pense em encapsulamento e no que ele protege."))).toBeNull();
    });

    it("orientação legítima não bloqueia", () => {
      expect(
        checkLeak(key, guidance("Imagine uma conta em que qualquer código pode escrever no saldo. Quem garantiria as regras? Que tipo de método poderia fazer esse papel?")),
      ).toBeNull();
    });
  });

  describe("015/US3-4 Código: nem a solução nem um trecho que a complete", () => {
    const key: LeakCheckKey = {
      type: "CODE",
      starterCode: "public class Soma {\n  public static int somar(int[] numeros) {\n    // seu código\n  }\n}",
      expectedSolution: [
        "public class Soma {",
        "  public static int somar(int[] numeros) {",
        "    int total = 0;",
        "    for (int numero : numeros) {",
        "      total += numero;",
        "    }",
        "    return total;",
        "  }",
        "}",
      ].join("\n"),
    };

    it("3 linhas seguidas não triviais da solução, no exemplo, ignorando espaços e caixa", () => {
      expect(checkLeak(key, guidance("Veja:", "int TOTAL = 0;\nfor(int numero:numeros){\n   total+=numero;"))).toBe("SOLUTION_OVERLAP");
    });

    it("também na mensagem; linhas triviais entre elas não interrompem a sequência", () => {
      expect(checkLeak(key, guidance("for (int numero : numeros) {\n  total += numero;\n}\nreturn total;"))).toBe("SOLUTION_OVERLAP");
    });

    it("2 linhas seguidas não bastam", () => {
      expect(checkLeak(key, guidance("Algo como `int total = 0;` e depois\nfor (int numero : numeros) {\nmas pense no que vem dentro."))).toBeNull();
    });

    it("linhas que o código inicial já mostra não contam", () => {
      expect(checkLeak(key, guidance("Comece por aqui:", "public class Soma {\n  public static int somar(int[] numeros) {\n    // seu código"))).toBeNull();
    });

    it("solução curta (até 3 linhas não triviais) bloqueia quando aparece inteira", () => {
      const short: LeakCheckKey = { type: "CODE", starterCode: null, expectedSolution: "def dobro(x):\n    return x * 2" };
      expect(checkLeak(short, guidance("Tente:", "def dobro(x): return x*2"))).toBe("SOLUTION_OVERLAP");
      expect(checkLeak(short, guidance("Uma função recebe um valor e devolve outro: o que precisa acontecer com x?"))).toBeNull();
    });

    it("exemplo análogo de outro problema não bloqueia", () => {
      const example = "int maior = valores[0];\nfor (int valor : valores) {\n  if (valor > maior) maior = valor;\n}";
      expect(checkLeak(key, guidance("Veja um exemplo diferente, que encontra o maior valor:", example))).toBeNull();
    });

    it("sem solução gravada nada bloqueia", () => {
      expect(checkLeak({ type: "CODE", starterCode: null, expectedSolution: null }, guidance("Pense no laço."))).toBeNull();
    });
  });
});
