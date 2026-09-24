export interface SyllabusContentData {
  title: string | null;
  syllabusText: string | null;
  competencyText: string | null;
  groups: { title: string | null; items: string[] }[];
}

/** What a missing field says: the extractor did not find it, or the teacher left it blank. */
const MISSING = {
  extraction: { masculine: "Não encontrado", feminine: "Não encontrada" },
  revision: { masculine: "Não informado", feminine: "Não informada" },
} as const;

/**
 * Syllabus content shown as plain text (FR-018): the extraction as stored, or a confirmed
 * revision. React escapes every string; nothing of the document is rendered as markup.
 */
export function SyllabusContent({ content, kind }: { content: SyllabusContentData; kind: keyof typeof MISSING }) {
  const missing = MISSING[kind];
  return (
    <>
      <dl className="grid grid-cols-1 gap-y-1">
        <dt className="font-semibold">Título</dt>
        <dd className="m-0 mb-3">{content.title ?? missing.masculine}</dd>
        <dt className="font-semibold">Ementa</dt>
        <dd className="m-0 mb-3 whitespace-pre-line">{content.syllabusText ?? missing.feminine}</dd>
        <dt className="font-semibold">Competência</dt>
        <dd className="m-0 mb-3 whitespace-pre-line">{content.competencyText ?? missing.feminine}</dd>
      </dl>
      <h3>Objetos de aprendizagem</h3>
      {content.groups.length === 0 ? (
        <p>Nenhum item encontrado.</p>
      ) : (
        <ol>
          {content.groups.map((group, index) => (
            <li key={index}>
              {group.title ?? "Sem título"}
              <ul>
                {group.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
