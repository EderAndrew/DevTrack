"use client";

import {
  EXAM_MAX_QUESTIONS,
  EXAM_MIN_QUESTIONS,
  EXAM_TOPICS_MAX,
  type ManualExamStatus,
  type TeacherExam,
  type UpdateExamRequest,
  type WorkTopicView,
} from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type FieldErrors,
  useFieldArray,
  useForm,
  type UseFormReturn,
  useWatch,
} from "react-hook-form";
import {
  ErrorSummary,
  type FormError,
  SubmitButton,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldMessage } from "@/components/ui/field-message";
import { fieldErrorId } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { messageForError } from "@/lib/messages/error-messages";
import { examRuleViolations } from "../api/exams";
import { useCreateExam, useExamRevision, useExamSubjects, useExamSyllabi } from "../hooks/use-exams";
import {
  emptyExam,
  emptyExamQuestion,
  examEditFormSchema,
  examFormSchema,
  type ExamFormValues,
  examFormValues,
  type ExamQuestionFormValues,
  questionValues,
  toCreateExamRequest,
  toUpdateExamRequest,
  violationText,
} from "../schemas/exam-form";
import {
  ADD_QUESTION_ID,
  alternativeFieldId,
  alternativesErrorId,
  correctRadioId,
  type ExamHeaderField,
  examFieldId,
  type QuestionField,
  questionCardId,
  questionFieldId,
  testCaseFieldId,
  topicCheckboxId,
} from "./exam-form-ids";
import { ExamQuestionCard } from "./exam-question-card";
import { InputField, SelectField, TextareaField } from "./form-fields";

type Form = UseFormReturn<ExamFormValues>;

interface FormErrors {
  summary: FormError[];
  /** Message shown next to each field, by field id. */
  fields: Record<string, string>;
}
const NO_ERRORS: FormErrors = { summary: [], fields: {} };

type MessageTree =
  { message?: unknown; root?: { message?: unknown } } | undefined;
const messageOf = (error: unknown) => {
  const tree = error as MessageTree;
  const message = tree?.message ?? tree?.root?.message;
  return typeof message === "string" ? message : undefined;
};

/** The order of the fields on screen, which the error summary follows. */
const HEADER_ORDER: ExamHeaderField[] = ["subjectId", "title", "description", "totalGrade", "revisionId", "topicIds"];
const QUESTION_ORDER: QuestionField[] = [
  "type",
  "statement",
  "difficulty",
  "expectedAnswer",
  "rubric",
  "correctAlternative",
  "instructions",
  "starterCode",
  "expectedSolution",
  "languageId",
  "explanation",
  "topicIds",
];

/** Where the summary's link of a field goes: a checkbox group sends the focus to its first box. */
type FocusTargets = Partial<Record<string, string>>;

function collectErrors(
  fieldErrors: FieldErrors<ExamFormValues>,
  focusTargets: FocusTargets,
): FormErrors {
  const result: FormErrors = { summary: [], fields: {} };
  const add = (fieldId: string, message: string, prefix = "") => {
    result.fields[fieldId] = message;
    result.summary.push({
      fieldId: focusTargets[fieldId] ?? fieldId,
      message: `${prefix}${message}`,
    });
  };
  for (const field of HEADER_ORDER) {
    const message = messageOf(fieldErrors[field]);
    if (message) add(examFieldId(field), message);
  }
  const questions = fieldErrors.questions;
  const rootMessage = messageOf(questions);
  if (rootMessage) result.summary.push({ message: rootMessage });
  if (!Array.isArray(questions)) return result;
  questions.forEach(
    (question: FieldErrors<ExamQuestionFormValues> | undefined, index) => {
      if (!question) return;
      const prefix = `Questão ${index + 1}: `;
      for (const field of QUESTION_ORDER) {
        if (field === "correctAlternative") {
          const alternatives = question.alternatives;
          if (Array.isArray(alternatives)) {
            alternatives.forEach((alternative, position) => {
              const message = messageOf(
                (alternative as { text?: unknown } | undefined)?.text,
              );
              if (message)
                add(alternativeFieldId(index, position), message, prefix);
            });
          }
          const duplicate = messageOf(alternatives);
          if (duplicate) {
            result.fields[alternativesErrorId(index)] = duplicate;
            result.summary.push({
              fieldId: alternativeFieldId(index, 0),
              message: `${prefix}${duplicate}`,
            });
          }
          const correct = messageOf(question.correctAlternative);
          if (correct) {
            result.fields[questionFieldId(index, field)] = correct;
            result.summary.push({
              fieldId: correctRadioId(index, 0),
              message: `${prefix}${correct}`,
            });
          }
          continue;
        }
        if (field === "languageId" && Array.isArray(question.testCases)) {
          const message = messageOf(question.languageId);
          if (message) add(questionFieldId(index, field), message, prefix);
          question.testCases.forEach((testCase, position) => {
            for (const part of ["input", "expectedOutput"] as const) {
              const caseMessage = messageOf(
                (testCase as Record<string, unknown> | undefined)?.[part],
              );
              if (caseMessage)
                add(
                  testCaseFieldId(index, position, part),
                  caseMessage,
                  prefix,
                );
            }
          });
          continue;
        }
        const message = messageOf(question[field]);
        if (message) add(questionFieldId(index, field), message, prefix);
      }
    },
  );
  return result;
}

/** A saved exam in the form (`/provas/[id]`). */
export interface ExamEdit {
  exam: TeacherExam;
  /** Sends the whole exam; a refusal throws and is shown in the summary. */
  onSave: (body: UpdateExamRequest) => Promise<void>;
  /** ARCHIVED, or no `provas.editar`: everything shown, nothing editable. */
  readOnly?: boolean;
}

/** The server's `422 EXAM_RULES`, question by question, each linking to its card. */
const rulesSummary = (error: unknown) =>
  examRuleViolations(error).map((violation) => ({ fieldId: questionCardId(violation.position), message: violationText(violation) }));

/**
 * Manual creation of an exam (018/US1): subject, title, description, total grade and 1–20 topics of a
 * confirmed syllabus, then 1–20 questions of the 011 types, each with its answer key, a difficulty
 * and 1–3 of the exam's topics, and what it is worth (read-only, from the total grade). The form
 * checks everything with the contract's rules before sending; "Salvar como rascunho" keeps it as
 * DRAFT, "Salvar e aprovar" as APPROVED (every question with its difficulty). No AI is involved. With
 * `edit` the same form holds a saved exam: the subject and the type of each saved question stay, and
 * "Salvar alterações" sends it all back with its version.
 */
export function ExamForm({ edit }: { edit?: ExamEdit } = {}) {
  const router = useRouter();
  const createExam = useCreateExam();
  // Which button submitted: "Salvar e aprovar" also checks the approval's difficulty.
  const intent = useRef<ManualExamStatus>("APPROVED");
  const form = useForm<ExamFormValues>({
    // Focus goes to the ErrorSummary, which links to each field.
    shouldFocusError: false,
    resolver: (values, context, options) =>
      zodResolver(edit ? examEditFormSchema(edit.exam.status === "APPROVED") : examFormSchema(intent.current === "APPROVED"))(values, context, options),
    defaultValues: edit ? examFormValues(edit.exam) : emptyExam(),
  });
  const readOnly = edit?.readOnly ?? false;
  const questions = useFieldArray({ control: form.control, name: "questions" });
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [announcement, setAnnouncement] = useState("");
  const pendingFocus = useRef<string | null>(null);
  const [totalGrade, questionValuesWatch, revisionId, topicIds] = useWatch({
    control: form.control,
    name: ["totalGrade", "questions", "revisionId", "topicIds"],
  });
  const revision = useExamRevision(revisionId || null);
  const values = questionValues(totalGrade, questions.fields.length);

  /** The exam's topics, in the order they were checked, as the questions offer them. */
  const examTopics = useMemo<WorkTopicView[]>(() => {
    const items = new Map(
      (revision.data?.groups ?? []).flatMap((group) => group.items.map((item) => [item.id, { itemText: item.text, groupTitle: group.title }] as const)),
    );
    return topicIds.flatMap((id) => {
      const item = items.get(id);
      return item ? [{ syllabusItemId: id, ...item }] : [];
    });
  }, [revision.data, topicIds]);

  const focusTargets = useMemo<FocusTargets>(() => {
    const targets: FocusTargets = {};
    const firstItem = revision.data?.groups.flatMap((group) => group.items)[0];
    if (firstItem) targets[examFieldId("topicIds")] = topicCheckboxId(examFieldId("topicIds"), firstItem.id);
    questions.fields.forEach((_, index) => {
      const scope = questionFieldId(index, "topicIds");
      if (examTopics[0]) targets[scope] = topicCheckboxId(scope, examTopics[0].syllabusItemId);
    });
    return targets;
  }, [revision.data, examTopics, questions.fields]);

  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    document.getElementById(id)?.focus();
  });

  const onInvalid = (fieldErrors: FieldErrors<ExamFormValues>) => setErrors(collectErrors(fieldErrors, focusTargets));

  const save = (saveAs: ManualExamStatus) => {
    intent.current = saveAs;
    return form.handleSubmit(async (formValues) => {
      setErrors(NO_ERRORS);
      try {
        if (edit) {
          await edit.onSave(toUpdateExamRequest(formValues, edit.exam.version));
          return;
        }
        await createExam.mutateAsync(toCreateExamRequest(formValues, saveAs));
        router.push("/provas?criada=1");
      } catch (error) {
        const rules = rulesSummary(error);
        setErrors({ summary: rules.length > 0 ? rules : [{ message: messageForError(error) }], fields: {} });
      }
    }, onInvalid);
  };

  const addQuestion = () => {
    questions.append(emptyExamQuestion(topicIds), { shouldFocus: false });
    pendingFocus.current = questionFieldId(questions.fields.length, "type");
    setAnnouncement(`Questão ${questions.fields.length + 1} adicionada.`);
  };
  const removeQuestion = (index: number) => {
    questions.remove(index);
    pendingFocus.current = ADD_QUESTION_ID;
    setAnnouncement(`Questão ${index + 1} removida.`);
  };
  const moveQuestion = (from: number, to: number) => {
    questions.move(from, to);
    // The focus follows the question, on the same button when it can still move that way.
    const direction = to < from ? "subir" : "descer";
    const edge = (direction === "subir" && to === 0) || (direction === "descer" && to === questions.fields.length - 1);
    pendingFocus.current = `questao-${to + 1}-${edge ? (direction === "subir" ? "descer" : "subir") : direction}`;
    setAnnouncement(`Questão ${from + 1} movida para a posição ${to + 1}.`);
  };

  const pending = form.formState.isSubmitting;
  const errorFor = (fieldId: string) => errors.fields[fieldId];

  return (
    <form
      noValidate
      aria-label={edit ? "Editar prova" : "Criar prova"}
      onSubmit={(event) => (pending || readOnly ? event.preventDefault() : void save("APPROVED")(event))}
    >
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <ErrorSummary errors={errors.summary} title="Não foi possível salvar a prova" />
      {/* A disabled fieldset turns every control inside it off (ARCHIVED, read-only). */}
      <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
        <ExamHeader form={form} errorFor={errorFor} subject={edit ? edit.exam.subject : undefined} />
        <ExamTopics form={form} errorFor={errorFor} />

        <p className="mt-0 mb-4 text-text-secondary">
          De {EXAM_MIN_QUESTIONS} a {EXAM_MAX_QUESTIONS} questões. O valor de cada uma vem da nota total, dividida em partes iguais.
        </p>
        {questions.fields.map((field, index) => (
          <ExamQuestionCard
            key={field.id}
            index={index}
            count={questions.fields.length}
            form={form}
            value={values?.[index] ?? null}
            examTopics={examTopics}
            errorFor={errorFor}
            onRemove={questions.fields.length > EXAM_MIN_QUESTIONS ? () => removeQuestion(index) : undefined}
            onMove={(to) => moveQuestion(index, to)}
            typeLocked={Boolean(questionValuesWatch[index]?.questionId)}
            readOnly={readOnly}
            inactiveLanguage={edit?.exam.questions.find((saved) => saved.id === questionValuesWatch[index]?.questionId)?.language}
          />
        ))}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Button
            id={ADD_QUESTION_ID}
            type="button"
            variant="secondary"
            onClick={addQuestion}
            disabled={questions.fields.length >= EXAM_MAX_QUESTIONS}
          >
            <Plus aria-hidden="true" />
            Adicionar questão
          </Button>
          <span className="text-body-sm text-text-secondary">
            {questions.fields.length} de {EXAM_MAX_QUESTIONS}
          </span>
        </div>
      </fieldset>
      {edit ? (
        readOnly ? null : (
          <div className="flex flex-wrap gap-2">
            <SubmitButton pending={pending} pendingLabel="Salvando…">
              Salvar alterações
            </SubmitButton>
            <Button asChild variant="ghost">
              <Link href="/provas">Voltar ao banco</Link>
            </Button>
          </div>
        )
      ) : (
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={pending} pendingLabel="Salvando…">
            Salvar e aprovar
          </SubmitButton>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => void save("DRAFT")()}>
            Salvar como rascunho
          </Button>
          <Button asChild variant="ghost">
            <Link href="/provas">Cancelar</Link>
          </Button>
        </div>
      )}
    </form>
  );
}

function ExamHeader({
  form,
  errorFor,
  subject,
}: {
  form: Form;
  errorFor: (fieldId: string) => string | undefined;
  /** A saved exam's subject, which never changes. */
  subject?: { name: string };
}) {
  const { register } = form;
  const subjects = useExamSubjects();
  const id = examFieldId;

  return (
    <>
      {subject ? (
        <p id={id("subjectId")} className="mt-0 mb-4">
          Disciplina: {subject.name}
        </p>
      ) : (
        <SelectField
          id={id("subjectId")}
          label="Disciplina"
          required
          hint={subjects.isError ? "Não foi possível carregar as disciplinas." : undefined}
          error={errorFor(id("subjectId"))}
          {...register("subjectId", {
            onChange: () => {
              form.setValue("revisionId", "");
              form.setValue("topicIds", []);
            },
          })}
        >
          <option value="">Escolha a disciplina</option>
          {(subjects.data?.items ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
      )}
      <InputField id={id("title")} label="Título" required error={errorFor(id("title"))} {...register("title")} />
      <TextareaField id={id("description")} label="Descrição" hint="Opcional." error={errorFor(id("description"))} {...register("description")} />
      <InputField
        id={id("totalGrade")}
        label="Nota total"
        required
        inputMode="decimal"
        hint="De 0,01 a 100,00, com até duas casas decimais. Ex.: 10 ou 7,5."
        error={errorFor(id("totalGrade"))}
        {...register("totalGrade")}
      />
    </>
  );
}

/**
 * The exam's topics (018/FR-002): a confirmed syllabus of the subject, then 1–20 of its items, by
 * group. Required; changing the syllabus clears them.
 */
function ExamTopics({ form, errorFor }: { form: Form; errorFor: (fieldId: string) => string | undefined }) {
  const { register, control, setValue } = form;
  const [subjectId, revisionId, selected] = useWatch({ control, name: ["subjectId", "revisionId", "topicIds"] });
  const syllabi = useExamSyllabi(subjectId);
  const revision = useExamRevision(revisionId || null);
  const confirmed = (syllabi.data?.items ?? []).flatMap((document) =>
    document.confirmedRevision ? [{ id: document.confirmedRevision.id, version: document.version }] : [],
  );
  const scope = examFieldId("topicIds");
  const error = errorFor(scope);
  const toggle = (itemId: string, checked: boolean) => {
    const next = checked ? [...selected, itemId] : selected.filter((id) => id !== itemId);
    setValue("topicIds", next, { shouldDirty: true });
    // A single exam topic is the obvious one for the questions that have none yet.
    if (next.length === 1) {
      form.getValues("questions").forEach((question, index) => {
        if (question.topicIds.length === 0) setValue(`questions.${index}.topicIds`, [...next], { shouldDirty: true });
      });
    }
  };

  return (
    <fieldset className="m-0 mb-6 border-0 p-0">
      <legend className="mb-2 text-h3 text-foreground">Tópicos da ementa</legend>
      <SelectField
        id={examFieldId("revisionId")}
        label="Ementa"
        required
        disabled={subjectId === ""}
        hint={
          subjectId === ""
            ? "Escolha a disciplina primeiro."
            : syllabi.isSuccess && confirmed.length === 0
              ? "Esta disciplina não tem ementa confirmada."
              : undefined
        }
        error={errorFor(examFieldId("revisionId"))}
        {...register("revisionId", { onChange: () => setValue("topicIds", []) })}
      >
        <option value="">Escolha a ementa</option>
        {confirmed.map((syllabus) => (
          <option key={syllabus.id} value={syllabus.id}>
            Versão {syllabus.version}
          </option>
        ))}
      </SelectField>
      {revision.data ? (
        <div
          aria-describedby={[`${scope}-dica`, error ? fieldErrorId(scope) : null].filter(Boolean).join(" ")}
          role="group"
          aria-label="Tópicos da prova"
        >
          <FieldMessage id={`${scope}-dica`} className="mb-2">
            De 1 a {EXAM_TOPICS_MAX} tópicos. {selected.length} de {EXAM_TOPICS_MAX} escolhidos.
          </FieldMessage>
          {revision.data.groups.map((group) => (
            <fieldset key={group.id} className="m-0 mb-3 border-0 p-0">
              <legend className="mb-1 text-label text-foreground">{group.title ?? `Grupo ${group.position}`}</legend>
              <div className="flex flex-col gap-2">
                {group.items.map((item) => {
                  const checkboxId = topicCheckboxId(scope, item.id);
                  const checked = selected.includes(item.id);
                  return (
                    <div key={item.id} className="flex items-center gap-2">
                      <Checkbox
                        id={checkboxId}
                        checked={checked}
                        disabled={!checked && selected.length >= EXAM_TOPICS_MAX}
                        aria-invalid={error ? true : undefined}
                        onChange={(event) => toggle(item.id, event.target.checked)}
                      />
                      <Label htmlFor={checkboxId}>{item.text}</Label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}
          {error ? (
            <FieldMessage id={fieldErrorId(scope)} tone="error">
              {error}
            </FieldMessage>
          ) : null}
        </div>
      ) : error ? (
        <FieldMessage id={fieldErrorId(scope)} tone="error">
          {error}
        </FieldMessage>
      ) : null}
    </fieldset>
  );
}
