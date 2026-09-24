/** One line of a document, as the PDF and DOCX readers hand it to the extractor (research E10). */
export interface SourceLine {
  text: string;
  /** Bold (PDF) or a title/heading style or bold runs (DOCX). */
  emphasis: boolean;
  /**
   * List level from the DOCX numbering (`numPr`): a first-level number opens a group, anything
   * deeper or a bullet is an item. `null` when the document says nothing (all PDF lines): the
   * extractor then reads the marker typed in the text.
   */
  list: "group" | "item" | null;
  /**
   * A PDF line may be the rest of a paragraph wrapped by the layout, so a line without a marker
   * continues the previous one. A DOCX paragraph never does.
   */
  wraps: boolean;
}
