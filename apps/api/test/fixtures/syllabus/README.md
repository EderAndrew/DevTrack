# Amostras de ementa (004)

Arquivos usados pelos testes de envio, inspeção e extração de ementas (research E6, E10, E22).
Todos são versionados. Exceto `protegido.pdf`, todos saem de `build-fixtures.ts`, que é
determinístico: gera os mesmos bytes em qualquer máquina e fuso horário.

```bash
pnpm --filter api fixtures:syllabus   # regrava os arquivos desta pasta, menos protegido.pdf
```

Depois de mudar `build-fixtures.ts`, rode o comando e versione os arquivos junto com a mudança.
Os arquivos de 10 MB dos testes de limite são montados em memória pelos próprios testes e
nunca entram aqui.

| Arquivo | Conteúdo | Resultado esperado |
|---------|----------|--------------------|
| `poo.pdf` | Ementa de POO em texto (Helvetica, 1 página) | extração igual a `poo.expected.json` |
| `poo.docx` | A mesma ementa em DOCX: títulos por estilo, grupos e itens por `numbering.xml` | extração igual a `poo.expected.json` |
| `poo.expected.json` | O `SyllabusExtraction` completo da ementa de POO | teste de ouro (SC-005) |
| `dez-paginas.pdf` | A ementa de POO repetida em 10 páginas | leitura de um documento maior |
| `escaneado.pdf` | Uma página só com imagem, sem texto | `PROCESSED` com `NO_TEXT` |
| `ementa.png`, `ementa.jpg` | Imagens válidas (300 × 200 e 320 × 200) | aceitas, sempre `NO_TEXT` (sem OCR) |
| `executavel.pdf` | Cabeçalho de executável (`MZ`) com extensão `.pdf` | `FILE_TYPE_NOT_ALLOWED` |
| `imagem.docx` | Os bytes de `ementa.png` com extensão `.docx` | `FILE_TYPE_NOT_ALLOWED` |
| `ole.docx` | Contêiner OLE (`D0 CF 11 E0`), como um DOCX criptografado | `FILE_PROTECTED` |
| `macro.docx` | `poo.docx` com `word/vbaProject.bin` | `FILE_MACROS` |
| `bomba.docx` | `poo.docx` com uma entrada que descompacta em 51 MiB | `FILE_TOO_COMPLEX` |
| `muitas-entradas.docx` | `poo.docx` com mais 1.000 entradas | `FILE_TOO_COMPLEX` |
| `gigante.png` | PNG de 8000 × 6000 (48 MP, 1 bit por pixel) | `FILE_TOO_COMPLEX` |
| `truncado.jpg` | `ementa.jpg` sem o marcador final `FF D9` | `FILE_UNREADABLE` |
| `corrompido.pdf` | Cabeçalho `%PDF-` seguido de um catálogo cortado, sem `xref` nem páginas | `FILE_UNREADABLE` |
| `protegido.pdf` | `poo.pdf` criptografado com senha de abertura | `FILE_PROTECTED` |

O texto da ementa de POO contém a frase marcadora `MARCADOR-EMENTA-004`: os testes de SC-010
conferem que ela nunca aparece em logs nem na auditoria.

## `protegido.pdf`

Binário pequeno (2,3 KB), versionado porque gerar a criptografia do PDF à mão exigiria
reimplementar o *security handler* (RC4/AES e as chaves derivadas de senha). Foi criado em
2026-09-23 a partir do `poo.pdf` desta pasta, com AES-256 (revisão 6 do *standard security
handler*), senha de abertura `ementa-004` e senha de dono `ementa-004-dono`, usando
[pikepdf](https://pypi.org/project/pikepdf/) 10.13 (qpdf 12.3) num ambiente virtual temporário:

```bash
python3 -m venv /tmp/pdf && /tmp/pdf/bin/pip install pikepdf
/tmp/pdf/bin/python -c "
import pikepdf
with pikepdf.open('poo.pdf') as pdf:
    pdf.save('protegido.pdf', encryption=pikepdf.Encryption(user='ementa-004', owner='ementa-004-dono', R=6))
"
```

O comando equivalente com o qpdf é
`qpdf --encrypt ementa-004 ementa-004-dono 256 -- poo.pdf protegido.pdf`. A criptografia usa
vetores aleatórios, então gerar de novo produz outros bytes: só faça isso se `poo.pdf` mudar.
O pdfjs-dist abre o arquivo apenas com a senha; sem ela, lança `PasswordException`.
