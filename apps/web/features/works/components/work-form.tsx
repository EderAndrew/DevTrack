"use client";

import {
  type ManualWorkStatus,
  WORK_QUESTIONS_MAX,
  WORK_QUESTIONS_MIN,
  WORK_TOPICS_MAX,
  type UpdateWorkRequest,
  WorkDifficultySchema,
  type WorkTeacherView,
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldMessage } from "@/components/ui/field-message";
import { fieldErrorId } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { messageForError } from "@/lib/messages/error-messages";
import {
  useCreateWork,
  useWorkRevision,
  useWorkSubjects,
  useWorkSyllabi,
} from "../hooks/use-works";
import {
  emptyQuestion,
  emptyWork,
  questionValues,
  toCreateWorkRequest,
  toUpdateWorkRequest,
  WORK_DIFFICULTY_LABELS,
  workEditFormSchema,
  type WorkFormValues,
  type WorkQuestionFormValues,
  workFormSchema,
  workFormValues,
} from "../schemas/work-form";
import { InputField, SelectField, TextareaField } from "./form-fields";
import {
  ADD_QUESTION_ID,
  alternativeFieldId,
  alternativesErrorId,
  correctRadioId,
  type QuestionField,
  questionFieldId,
  testCaseFieldId,
  topicCheckboxId,
  type WorkHeaderField,
  workFieldId,
} from "./work-form-ids";
import { WorkQuestionCard } from "./work-question-card";

type Form = UseFormReturn<WorkFormValues>;

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
const HEADER_ORDER: WorkHeaderField[] = [
  "subjectId",
  "title",
  "description",
  "totalGrade",
  "difficulty",
  "revisionId",
  "topicItemIds",
];
const QUESTION_ORDER: QuestionField[] = [
  "type",
  "statement",
  "expectedAnswer",
  "rubric",
  "correctAlternative",
  "instructions",
  "starterCode",
  "expectedSolution",
  "languageId",
  "explanation",
  "topicItemIds",
];

/** Where the summary's link of a field goes: a checkbox group sends the focus to its first box. */
type FocusTargets = Partial<Record<string, string>>;

function collectErrors(
  fieldErrors: FieldErrors<WorkFormValues>,
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
    if (message) add(workFieldId(field), message);
  }
  const questions = fieldErrors.questions;
  const rootMessage = messageOf(questions);
  if (rootMessage) result.summary.push({ message: rootMessage });
  if (!Array.isArray(questions)) return result;
  questions.forEach(
    (question: FieldErrors<WorkQuestionFormValues> | undefined, index) => {
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

/** A saved work in the form (`/trabalhos/[id]`, US5). */
export interface WorkEdit {
  work: WorkTeacherView;
  /** Sends the whole work; a refusal throws and is shown in the summary. */
  onSave: (body: UpdateWorkRequest) => Promise<void>;
  /** ARCHIVED, or no `trabalhos.editar`: everything shown, nothing editable. */
  readOnly?: boolean;
}

/**
 * Manual creation of a work (011/US1): subject, title, description, total grade, an optional
 * difficulty and optional topics of a confirmed syllabus, then 1–10 questions of any type, each
 * with its answer key and what it is worth. The form checks everything with the contract's rules
 * before sending; "Salvar como rascunho" keeps it as DRAFT, "Salvar e aprovar" as APPROVED
 * (011/FR-014). No AI is involved. With `edit` (US5) the same form holds a saved work: the subject
 * and the type of each saved question stay, and "Salvar alterações" sends it all back with its
 * version.
 */
export function WorkForm({ edit }: { edit?: WorkEdit } = {}) {
  const router = useRouter();
  const createWork = useCreateWork();
  const form = useForm<WorkFormValues>({
    // Focus goes to the ErrorSummary, which links to each field.
    shouldFocusError: false,
    resolver: zodResolver(edit ? workEditFormSchema : workFormSchema),
    defaultValues: edit ? workFormValues(edit.work) : emptyWork(),
  });
  const readOnly = edit?.readOnly ?? false;
  const questions = useFieldArray({ control: form.control, name: "questions" });
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [announcement, setAnnouncement] = useState("");
  const pendingFocus = useRef<string | null>(null);
  const [totalGrade, questionValuesWatch, revisionId, topicItemIds] = useWatch({
    control: form.control,
    name: ["totalGrade", "questions", "revisionId", "topicItemIds"],
  });
  const revision = useWorkRevision(revisionId || null);
  const values = questionValues(totalGrade, questions.fields.length);

  /** The work's topics, in the order they were checked, as the questions offer them. */
  const workTopics = useMemo<WorkTopicView[]>(() => {
    const items = new Map(
      (revision.data?.groups ?? []).flatMap((group) =>
        group.items.map(
          (item) =>
            [
              item.id,
              { itemText: item.text, groupTitle: group.title },
            ] as const,
        ),
      ),
    );
    return topicItemIds.flatMap((id) => {
      const item = items.get(id);
      return item ? [{ syllabusItemId: id, ...item }] : [];
    });
  }, [revision.data, topicItemIds]);

  const focusTargets = useMemo<FocusTargets>(() => {
    const targets: FocusTargets = {};
    const firstItem = revision.data?.groups.flatMap((group) => group.items)[0];
    if (firstItem)
      targets[workFieldId("topicItemIds")] = topicCheckboxId(
        workFieldId("topicItemIds"),
        firstItem.id,
      );
    questions.fields.forEach((_, index) => {
      const scope = questionFieldId(index, "topicItemIds");
      if (workTopics[0])
        targets[scope] = topicCheckboxId(scope, workTopics[0].syllabusItemId);
    });
    return targets;
  }, [revision.data, workTopics, questions.fields]);

  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    document.getElementById(id)?.focus();
  });

  const onInvalid = (fieldErrors: FieldErrors<WorkFormValues>) =>
    setErrors(collectErrors(fieldErrors, focusTargets));

  const save = (status: ManualWorkStatus) =>
    form.handleSubmit(async (formValues) => {
      setErrors(NO_ERRORS);
      try {
        if (edit) {
          await edit.onSave(toUpdateWorkRequest(formValues, edit.work.version));
          return;
        }
        await createWork.mutateAsync(toCreateWorkRequest(formValues, status));
        router.push("/trabalhos?criado=1");
      } catch (error) {
        setErrors({
          summary: [{ message: messageForError(error) }],
          fields: {},
        });
      }
    }, onInvalid);

  const addQuestion = () => {
    questions.append(emptyQuestion(), { shouldFocus: false });
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
    const edge =
      (direction === "subir" && to === 0) ||
      (direction === "descer" && to === questions.fields.length - 1);
    pendingFocus.current = `questao-${to + 1}-${edge ? (direction === "subir" ? "descer" : "subir") : direction}`;
    setAnnouncement(`Questão ${from + 1} movida para a posição ${to + 1}.`);
  };

  const codeWithoutTests = questionValuesWatch.flatMap((question, index) =>
    question.type === "CODE" && question.testCases.length === 0
      ? [index + 1]
      : [],
  );
  const pending = form.formState.isSubmitting;
  const errorFor = (fieldId: string) => errors.fields[fieldId];

  return (
    <form
      noValidate
      aria-label={edit ? "Editar trabalho" : "Criar trabalho"}
      onSubmit={(event) =>
        pending || readOnly
          ? event.preventDefault()
          : void save("APPROVED")(event)
      }
    >
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <ErrorSummary
        errors={errors.summary}
        title="Não foi possível salvar o trabalho"
      />
      {/* A disabled fieldset turns every control inside it off (ARCHIVED, read-only). */}
      <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
        <WorkHeader
          form={form}
          errorFor={errorFor}
          subject={edit ? edit.work.subject : undefined}
        />
        <WorkTopics form={form} errorFor={errorFor} />

        <p className="mt-0 mb-4 text-text-secondary">
          De {WORK_QUESTIONS_MIN} a {WORK_QUESTIONS_MAX} questões. O valor de
          cada uma vem da nota total, dividida em partes iguais.
        </p>
        {questions.fields.map((field, index) => (
          <WorkQuestionCard
            key={field.id}
            index={index}
            count={questions.fields.length}
            form={form}
            value={values?.[index] ?? null}
            workTopics={workTopics}
            errorFor={errorFor}
            onRemove={
              questions.fields.length > WORK_QUESTIONS_MIN
                ? () => removeQuestion(index)
                : undefined
            }
            onMove={(to) => moveQuestion(index, to)}
            typeLocked={Boolean(questionValuesWatch[index]?.questionId)}
            readOnly={readOnly}
            inactiveLanguage={
              edit?.work.questions.find(
                (saved) => saved.id === questionValuesWatch[index]?.questionId,
              )?.language
            }
          />
        ))}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Button
            id={ADD_QUESTION_ID}
            type="button"
            variant="secondary"
            onClick={addQuestion}
            disabled={questions.fields.length >= WORK_QUESTIONS_MAX}
          >
            <Plus aria-hidden="true" />
            Adicionar questão
          </Button>
          <span className="text-body-sm text-text-secondary">
            {questions.fields.length} de {WORK_QUESTIONS_MAX}
          </span>
        </div>

        {codeWithoutTests.length > 0 ? (
          <Alert variant="warning" className="mb-4">
            <AlertDescription>
              {codeWithoutTests.length === 1
                ? `A questão ${codeWithoutTests[0]} é`
                : `As questões ${codeWithoutTests.join(", ")} são`}{" "}
              de código sem casos de teste: o trabalho pode ser aprovado, mas{" "}
              {codeWithoutTests.length === 1
                ? "ela não poderá ser corrigida"
                : "elas não poderão ser corrigidas"}{" "}
              automaticamente.
            </AlertDescription>
          </Alert>
        ) : null}
      </fieldset>
      {edit ? (
        readOnly ? null : (
          <div className="flex flex-wrap gap-2">
            <SubmitButton pending={pending} pendingLabel="Salvando…">
              Salvar alterações
            </SubmitButton>
            <Button asChild variant="ghost">
              <Link href="/trabalhos">Voltar ao banco</Link>
            </Button>
          </div>
        )
      ) : (
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={pending} pendingLabel="Salvando…">
            Salvar e aprovar
          </SubmitButton>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => void save("DRAFT")()}
          >
            Salvar como rascunho
          </Button>
          <Button asChild variant="ghost">
            <Link href="/trabalhos">Cancelar</Link>
          </Button>
        </div>
      )}
    </form>
  );
}

function WorkHeader({
  form,
  errorFor,
  subject,
}: {
  form: Form;
  errorFor: (fieldId: string) => string | undefined;
  /** A saved work's subject, which never changes (research W16). */
  subject?: { name: string };
}) {
  const { register } = form;
  const subjects = useWorkSubjects();
  const id = workFieldId;

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
          hint={
            subjects.isError
              ? "Não foi possível carregar as disciplinas."
              : undefined
          }
          error={errorFor(id("subjectId"))}
          {...register("subjectId", {
            onChange: () => {
              form.setValue("revisionId", "");
              form.setValue("topicItemIds", []);
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
      <InputField
        id={id("title")}
        label="Título"
        required
        error={errorFor(id("title"))}
        {...register("title")}
      />
      <TextareaField
        id={id("description")}
        label="Descrição"
        hint="Opcional."
        error={errorFor(id("description"))}
        {...register("description")}
      />
      <div className="grid gap-x-4 md:grid-cols-2">
        <InputField
          id={id("totalGrade")}
          label="Nota total"
          required
          inputMode="decimal"
          hint="De 0,01 a 100,00, com até duas casas decimais. Ex.: 10 ou 7,5."
          error={errorFor(id("totalGrade"))}
          {...register("totalGrade")}
        />
        <SelectField
          id={id("difficulty")}
          label="Dificuldade"
          hint="Opcional."
          error={errorFor(id("difficulty"))}
          {...register("difficulty")}
        >
          <option value="">Sem dificuldade</option>
          {WorkDifficultySchema.options.map((option) => (
            <option key={option} value={option}>
              {WORK_DIFFICULTY_LABELS[option]}
            </option>
          ))}
        </SelectField>
      </div>
    </>
  );
}

/**
 * The work's topics (011/FR-003): a confirmed syllabus of the subject, then up to 10 of its items,
 * by group. Optional; changing the syllabus clears them.
 */
function WorkTopics({
  form,
  errorFor,
}: {
  form: Form;
  errorFor: (fieldId: string) => string | undefined;
}) {
  const { register, control, setValue } = form;
  const [subjectId, revisionId, selected] = useWatch({
    control,
    name: ["subjectId", "revisionId", "topicItemIds"],
  });
  const syllabi = useWorkSyllabi(subjectId);
  const revision = useWorkRevision(revisionId || null);
  const confirmed = (syllabi.data?.items ?? []).flatMap((document) =>
    document.confirmedRevision
      ? [{ id: document.confirmedRevision.id, version: document.version }]
      : [],
  );
  const scope = workFieldId("topicItemIds");
  const error = errorFor(scope);
  const toggle = (itemId: string, checked: boolean) =>
    setValue(
      "topicItemIds",
      checked ? [...selected, itemId] : selected.filter((id) => id !== itemId),
      { shouldDirty: true },
    );

  return (
    <fieldset className="m-0 mb-6 border-0 p-0">
      <legend className="mb-2 text-h3 text-foreground">
        Tópicos da ementa (opcional)
      </legend>
      <SelectField
        id={workFieldId("revisionId")}
        label="Ementa"
        disabled={subjectId === ""}
        hint={
          subjectId === ""
            ? "Escolha a disciplina primeiro."
            : syllabi.isSuccess && confirmed.length === 0
              ? "Esta disciplina não tem ementa confirmada."
              : undefined
        }
        error={errorFor(workFieldId("revisionId"))}
        {...register("revisionId", {
          onChange: () => setValue("topicItemIds", []),
        })}
      >
        <option value="">Sem tópicos</option>
        {confirmed.map((syllabus) => (
          <option key={syllabus.id} value={syllabus.id}>
            Versão {syllabus.version}
          </option>
        ))}
      </SelectField>
      {revision.data ? (
        <div
          aria-describedby={[
            `${scope}-dica`,
            error ? fieldErrorId(scope) : null,
          ]
            .filter(Boolean)
            .join(" ")}
          role="group"
          aria-label="Tópicos do trabalho"
        >
          <FieldMessage id={`${scope}-dica`} className="mb-2">
            Até {WORK_TOPICS_MAX} tópicos. {selected.length} de{" "}
            {WORK_TOPICS_MAX} escolhidos.
          </FieldMessage>
          {revision.data.groups.map((group) => (
            <fieldset key={group.id} className="m-0 mb-3 border-0 p-0">
              <legend className="mb-1 text-label text-foreground">
                {group.title ?? `Grupo ${group.position}`}
              </legend>
              <div className="flex flex-col gap-2">
                {group.items.map((item) => {
                  const checkboxId = topicCheckboxId(scope, item.id);
                  const checked = selected.includes(item.id);
                  return (
                    <div key={item.id} className="flex items-center gap-2">
                      <Checkbox
                        id={checkboxId}
                        checked={checked}
                        disabled={
                          !checked && selected.length >= WORK_TOPICS_MAX
                        }
                        aria-invalid={error ? true : undefined}
                        onChange={(event) =>
                          toggle(item.id, event.target.checked)
                        }
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
      ) : null}
    </fieldset>
  );
}
