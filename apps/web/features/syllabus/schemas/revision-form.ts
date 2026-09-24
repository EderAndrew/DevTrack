import {
  MAX_ITEMS_PER_REVISION,
  type SaveSyllabusRevisionRequest,
  SaveSyllabusRevisionRequestSchema,
  type SyllabusRevisionView,
} from "@repo/contracts";
import { z } from "zod";
import { INVALID_DATA } from "@/lib/forms/field-messages";

const { shape } = SaveSyllabusRevisionRequestSchema;
const groupShape = shape.groups.element.shape;
const itemShape = groupShape.items.element.shape;

export const ITEM_REQUIRED = "Informe o texto do item.";
export const TOO_MANY_ITEMS = `A ementa pode ter no máximo ${MAX_ITEMS_PER_REVISION} itens.`;

/**
 * Revision editor (004 contracts/web-ui.md), derived from `SaveSyllabusRevisionRequestSchema`:
 * blank texts are sent as null, and `itemId` is the item's `id` in the draft (named apart from
 * the key React Hook Form gives each row of a field array).
 */
export const RevisionFormSchema = z
  .strictObject({
    title: shape.title.unwrap().unwrap(),
    syllabusText: shape.syllabusText.unwrap().unwrap(),
    competencyText: shape.competencyText.unwrap().unwrap(),
    groups: z.array(
      z.strictObject({
        title: groupShape.title.unwrap().unwrap(),
        items: z.array(z.strictObject({ itemId: itemShape.id, text: itemShape.text })),
      }),
    ),
  })
  .refine((value) => value.groups.reduce((sum, group) => sum + group.items.length, 0) <= MAX_ITEMS_PER_REVISION, {
    path: ["groups"],
    message: TOO_MANY_ITEMS,
  });
export type RevisionFormInput = z.input<typeof RevisionFormSchema>;
export type RevisionFormOutput = z.output<typeof RevisionFormSchema>;

/** An item's text left blank has its own message; any other violation is "Dados inválidos.". */
export const revisionFormMessages: z.core.$ZodErrorMap = (issue) => {
  const isItemText = issue.path?.at(-1) === "text" && issue.path.includes("items");
  const blank = typeof issue.input === "string" && issue.input.trim() === "";
  return isItemText && blank ? ITEM_REQUIRED : INVALID_DATA;
};

export const toRevisionForm = (revision: SyllabusRevisionView): RevisionFormInput => ({
  title: revision.title ?? "",
  syllabusText: revision.syllabusText ?? "",
  competencyText: revision.competencyText ?? "",
  groups: revision.groups.map((group) => ({
    title: group.title ?? "",
    items: group.items.map((item) => ({ itemId: item.id, text: item.text })),
  })),
});

export const toSaveRevisionRequest = (values: RevisionFormOutput): SaveSyllabusRevisionRequest => ({
  title: values.title || null,
  syllabusText: values.syllabusText || null,
  competencyText: values.competencyText || null,
  groups: values.groups.map((group) => ({
    title: group.title || null,
    items: group.items.map((item) => ({ ...(item.itemId ? { id: item.itemId } : {}), text: item.text })),
  })),
});

export const itemCount = (values: Pick<RevisionFormInput, "groups">) =>
  values.groups.reduce((sum, group) => sum + group.items.length, 0);
