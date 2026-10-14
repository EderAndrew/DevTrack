"use client";

import { EXAM_GENERATION_TOPICS_MAX, EXAM_MAX_QUESTIONS, EXAM_TRICK_QUESTIONS_MAX, WorkDifficultySchema, type WorkQuestionType, WorkQuestionTypeSchema } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type FieldErrors, useForm, useWatch } from "react-hook-form";
import { ErrorSummary, type FormError, SubmitButton } from "@/components/shared";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldMessage } from "@/components/ui/field-message";
import { fieldErrorId } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { EXAM_AI_UNAVAILABLE, messageForError } from "@/lib/messages/error-messages";
import { useExamGenerationAvailability, useExamRevision, useExamSubjects, useExamSyllabi, useRequestExamGeneration } from "../hooks/use-exams";
import { DIFFICULTY_LABELS, QUESTION_TYPE_LABELS } from "../schemas/exam-form";
import {
  EXAM_GENERATION_FIELDS,
  type ExamGenerationField,
  ExamGenerationFormSchema,
  type ExamGenerationFormValues,
  emptyExamGenerationForm,
  quantityOf,
  toExamGenerationRequest,
} from "../schemas/exam-generation-form";
import { InputField, SelectField } from "./form-fields";

const countId = (type: WorkQuestionType) => `gerar-prova-quantidade-${type}`;
const topicId = (itemId: string) => `gerar-prova-topico-${itemId}`;

const IDS: Record<ExamGenerationField, string> & { revisionId: string } = {
  subjectId: "gerar-prova-disciplina",
  revisionId: "gerar-prova-ementa",
  topicIds: "gerar-prova-topicos",
  title: "gerar-prova-titulo",
  difficulty: "gerar-prova-dificuldade",
  totalGrade: "gerar-prova-nota",
  counts: countId("OPEN_ANSWER"),
  trickCount: "gerar-prova-pegadinhas",
};

const NO_LANGUAGE_HINT = "Esta ementa não tem linguagem: defina-a numa nova revisão da ementa para gerar questões de código.";

/** A teacher who can't generate now keeps the manual creation (018/US7-3). */
const BLOCKED = new Set(["AGENT_DISABLED", "MODEL_UNAVAILABLE"]);

/**
 * "Criar prova com IA" (018/US7, contracts/web-ui.md): the 011 request for an exam — the subject, a
 * confirmed syllabus and 1–10 of its topics by group, the title, difficulty and total grade, how many
 * questions of each type (1 to 20 in all) and the trick questions, at most the multiple-choice ones.
 * No model, provider or tier is ever chosen here. The exam is generated in the background as a DRAFT
 * that the teacher reviews and approves in the bank.
 */
export function ExamGenerationForm() {
  const router = useRouter();
  const availability = useExamGenerationAvailability();
  const request = useRequestExamGeneration();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<FormError[]>([]);
  const [fieldMessages, setFieldMessages] = useState<Partial<Record<ExamGenerationField, string>>>({});
  const form = useForm<ExamGenerationFormValues>({
    shouldFocusError: false,
    resolver: zodResolver(ExamGenerationFormSchema),
    defaultValues: emptyExamGenerationForm(),
  });
  const { register, control, setValue, handleSubmit, formState } = form;
  const values = useWatch({ control }) as ExamGenerationFormValues;
  const subjects = useExamSubjects();
  const syllabi = useExamSyllabi(values.subjectId);
  const revision = useExamRevision(values.revisionId || null);
  const language = revision.data?.language ?? null;
  const selected = Array.isArray(values.topicIds) ? values.topicIds : [];
  const quantity = quantityOf(values.counts);
  const blocked = availability.data !== undefined && BLOCKED.has(availability.data.availability);
  const noCode = revision.data !== undefined && !language;
  const confirmed = (syllabi.data?.items ?? []).flatMap((document) =>
    document.confirmedRevision ? [{ id: document.confirmedRevision.id, version: document.version }] : [],
  );

  // A syllabus without a language can't have code: its count leaves the request.
  useEffect(() => {
    if (noCode && values.counts.CODE !== "") setValue("counts.CODE", "");
  }, [noCode, values.counts.CODE, setValue]);

  const errorFor = (field: ExamGenerationField) => fieldMessages[field];

  const onInvalid = (fieldErrors: FieldErrors<ExamGenerationFormValues>) => {
    const messages: Partial<Record<ExamGenerationField, string>> = {};
    for (const field of EXAM_GENERATION_FIELDS) {
      const error = fieldErrors[field] as { message?: unknown; root?: { message?: unknown } } | undefined;
      const message = error?.message ?? error?.root?.message;
      if (typeof message === "string") messages[field] = message;
    }
    setFieldMessages(messages);
    // The summary links the topics to the first checkbox, or to the syllabus while none is shown.
    const firstTopic = revision.data?.groups[0]?.items[0]?.id;
    setErrors(
      EXAM_GENERATION_FIELDS.flatMap((field) => {
        const message = messages[field];
        if (message === undefined) return [];
        const fieldId = field === "topicIds" ? (firstTopic ? topicId(firstTopic) : IDS.revisionId) : IDS[field];
        return [{ fieldId, message }];
      }),
    );
  };

  const onSubmit = handleSubmit(async (formValues) => {
    setErrors([]);
    setFieldMessages({});
    try {
      const created = await request.mutateAsync(toExamGenerationRequest(formValues, idempotencyKey));
      router.push(`/provas/pedidos/${created.id}`);
    } catch (error) {
      setErrors([{ message: messageForError(error) }]);
    }
  }, onInvalid);

  const topicsError = errorFor("topicIds");
  const toggleTopic = (itemId: string, checked: boolean) =>
    setValue("topicIds", checked ? [...selected, itemId] : selected.filter((id) => id !== itemId), { shouldDirty: true });
  const pending = formState.isSubmitting;

  return (
    <form noValidate aria-label="Criar prova com IA" onSubmit={(event) => (pending ? event.preventDefault() : void onSubmit(event))} className="max-w-192">
      {availability.data && availability.data.availability !== "AVAILABLE" ? (
        <Notice role="status">
          <p className="m-0">
            {EXAM_AI_UNAVAILABLE} <Link href="/provas/nova">Criar prova manualmente</Link>
          </p>
        </Notice>
      ) : null}
      <ErrorSummary errors={errors} title="Não foi possível pedir a prova" />

      <fieldset className="m-0 mb-4 border-0 p-0">
        <legend className="mb-2 text-h3">Tópicos</legend>
        <div className="grid gap-x-4 md:grid-cols-2">
          <SelectField
            id={IDS.subjectId}
            label="Disciplina"
            required
            error={errorFor("subjectId")}
            {...register("subjectId", {
              onChange: () => {
                setValue("revisionId", "");
                setValue("topicIds", []);
              },
            })}
          >
            <option value="">Escolha a disciplina</option>
            {(subjects.data?.items ?? []).map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id={IDS.revisionId}
            label="Ementa"
            required
            disabled={values.subjectId === ""}
            hint={values.subjectId !== "" && syllabi.isSuccess && confirmed.length === 0 ? "Esta disciplina não tem ementa confirmada." : undefined}
            error={revision.data ? undefined : topicsError}
            {...register("revisionId", { onChange: () => setValue("topicIds", []) })}
          >
            <option value="">Escolha a ementa</option>
            {confirmed.map((syllabus) => (
              <option key={syllabus.id} value={syllabus.id}>
                Versão {syllabus.version}
              </option>
            ))}
          </SelectField>
        </div>
        {revision.data ? (
          <div
            role="group"
            aria-label="Tópicos da prova"
            aria-describedby={[`${IDS.topicIds}-dica`, topicsError ? fieldErrorId(IDS.topicIds) : null].filter(Boolean).join(" ")}
          >
            <FieldMessage id={`${IDS.topicIds}-dica`} className="mb-2">
              De 1 a {EXAM_GENERATION_TOPICS_MAX} tópicos; cada questão fica ligada a pelo menos um deles. {selected.length} de {EXAM_GENERATION_TOPICS_MAX}{" "}
              escolhidos.
            </FieldMessage>
            {revision.data.groups.map((group) => (
              <fieldset key={group.id} className="m-0 mb-3 border-0 p-0">
                <legend className="mb-1 text-label text-foreground">{group.title ?? `Grupo ${group.position}`}</legend>
                <div className="flex flex-col gap-2">
                  {group.items.map((item) => {
                    const checked = selected.includes(item.id);
                    return (
                      <div key={item.id} className="flex items-center gap-2">
                        <Checkbox
                          id={topicId(item.id)}
                          checked={checked}
                          disabled={!checked && selected.length >= EXAM_GENERATION_TOPICS_MAX}
                          aria-invalid={topicsError ? true : undefined}
                          onChange={(event) => toggleTopic(item.id, event.target.checked)}
                        />
                        <Label htmlFor={topicId(item.id)}>{item.text}</Label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            {topicsError ? (
              <FieldMessage id={fieldErrorId(IDS.topicIds)} tone="error" className="mb-2">
                {topicsError}
              </FieldMessage>
            ) : null}
            <p className="mt-0 mb-4">
              <span className="font-semibold">Linguagem da ementa:</span> {language?.name ?? "Nenhuma"}
            </p>
          </div>
        ) : null}
      </fieldset>

      <InputField id={IDS.title} label="Título" required error={errorFor("title")} {...register("title")} />
      <div className="grid gap-x-4 md:grid-cols-2">
        <SelectField id={IDS.difficulty} label="Dificuldade" required error={errorFor("difficulty")} {...register("difficulty")}>
          <option value="">Escolha a dificuldade</option>
          {WorkDifficultySchema.options.map((option) => (
            <option key={option} value={option}>
              {DIFFICULTY_LABELS[option]}
            </option>
          ))}
        </SelectField>
        <InputField id={IDS.totalGrade} label="Nota total" required inputMode="decimal" hint="Ex.: 10 ou 7,5." error={errorFor("totalGrade")} {...register("totalGrade")} />
      </div>

      <fieldset className="m-0 mb-4 border-0 p-0" aria-describedby={[`${IDS.counts}-total`, errorFor("counts") ? fieldErrorId(IDS.counts) : null].filter(Boolean).join(" ")}>
        <legend className="mb-2 text-label text-foreground">Questões por tipo</legend>
        <div className="grid gap-x-4 md:grid-cols-3">
          {WorkQuestionTypeSchema.options.map((type) => {
            const disabled = type === "CODE" && noCode;
            return (
              <InputField
                key={type}
                id={countId(type)}
                label={QUESTION_TYPE_LABELS[type]}
                type="number"
                min={0}
                max={EXAM_MAX_QUESTIONS}
                inputMode="numeric"
                disabled={disabled}
                hint={disabled ? NO_LANGUAGE_HINT : undefined}
                error={type === "OPEN_ANSWER" ? errorFor("counts") : undefined}
                {...register(`counts.${type}`)}
              />
            );
          })}
        </div>
        <p id={`${IDS.counts}-total`} className="mt-0" aria-live="polite">
          {quantity === null ? "Informe números inteiros." : `Total: ${quantity} de ${EXAM_MAX_QUESTIONS} questões.`}
        </p>
      </fieldset>

      <SelectField
        id={IDS.trickCount}
        label="Pegadinhas"
        hint="Só em questões de múltipla escolha; no máximo esse número."
        error={errorFor("trickCount")}
        {...register("trickCount")}
      >
        {Array.from({ length: EXAM_TRICK_QUESTIONS_MAX + 1 }, (_, index) => String(index)).map((count) => (
          <option key={count} value={count}>
            {count}
          </option>
        ))}
      </SelectField>

      <div className="flex flex-wrap gap-2">
        {blocked ? (
          <Button type="submit" disabled>
            Gerar prova
          </Button>
        ) : (
          <SubmitButton pending={pending} pendingLabel="Enviando…">
            Gerar prova
          </SubmitButton>
        )}
        <Button asChild variant="ghost">
          <Link href="/provas">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
