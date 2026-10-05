"use client";

import { useState } from "react";
import { CodeBlock } from "@/components/ui/code/code-block";
import { CodeEditor } from "@/components/ui/code/code-editor";
import { Sample, Showcase } from "./sample";

// 014 (research L14): the code components, colored by the language's grammar key (catalog data);
// without a grammar they show the same text in `--foreground`.

const JAVA = 'class Conta {\n  private double saldo = 0; // em reais\n  void depositar(double valor) { saldo += valor; }\n}';
const PYTHON = 'def media(notas):\n    """Média simples."""\n    return sum(notas) / len(notas)  # nunca vazia';
const PLAIN = "fun main() {\n    println(\"Kotlin sem gramática\")\n}";

export function CodeEditorShowcase() {
  const [java, setJava] = useState(JAVA);
  const [python, setPython] = useState(PYTHON);
  const [plain, setPlain] = useState(PLAIN);
  return (
    <Showcase id="code-editor">
      <Sample name="Java" className="block">
        <CodeEditor id="vitrine-editor-java" aria-label="Editor de código (Java)" highlight="java" value={java} onChange={setJava} />
      </Sample>
      <Sample name="Python" className="block">
        <CodeEditor id="vitrine-editor-python" aria-label="Editor de código (Python)" highlight="python" value={python} onChange={setPython} />
      </Sample>
      <Sample name="sem gramática" className="block">
        <CodeEditor id="vitrine-editor-texto" aria-label="Editor de código (Kotlin)" highlight={null} value={plain} onChange={setPlain} />
      </Sample>
      <Sample name="editável" className="block">
        <CodeEditor id="vitrine-editor" aria-label="Editor de código" highlight="python" value={python} onChange={setPython} />
      </Sample>
      <Sample name="desabilitado" className="block">
        <CodeEditor
          id="vitrine-editor-desabilitado"
          aria-label="Editor de código desabilitado"
          highlight="python"
          value="print('somente leitura')"
          onChange={() => undefined}
          disabled
        />
      </Sample>
    </Showcase>
  );
}

export function CodeBlockShowcase() {
  return (
    <Showcase id="code-block">
      <Sample name="Java" className="block">
        <CodeBlock code={JAVA} highlight="java" label="Solução de referência (Java)" />
      </Sample>
      <Sample name="Python" className="block">
        <CodeBlock code={PYTHON} highlight="python" label="Resposta do aluno (Python)" />
      </Sample>
      <Sample name="sem gramática" className="block">
        <CodeBlock code={PLAIN} highlight={null} label="Código inicial (Kotlin)" />
      </Sample>
      <Sample name="linha longa" className="block">
        <CodeBlock
          code={'String mensagem = "Uma linha bem longa rola dentro do bloco, nunca a página inteira, nem a 360 px de largura";'}
          highlight="java"
          label="Código com rolagem horizontal"
        />
      </Sample>
    </Showcase>
  );
}
