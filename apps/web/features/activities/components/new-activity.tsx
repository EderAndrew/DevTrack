"use client";

import type { ActivitySource, ActivityType, ExamCoverage, ExamSummary, ExerciseTeacherView, ScopeCheck, WorkSummary } from "@repo/contracts";
import { ACTIVITY_EXERCISES_MAX, ActivityTypeSchema, EXERCISE_POINTS, possiblePoints } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { ErrorSummary, Field, SubmitButton } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClass } from "@/features/classes/hooks/use-classes";
import { useCodeRunnerAvailability } from "@/features/code-run/hooks/use-code-runner-availability";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { useApprovedExams, useApprovedExercises, useApprovedWorks, useCreateActivity, useHelpAvailability, useScopeCheck } from "../hooks/use-activities";
import {
  ACTIVITY_TYPE_LABELS,
  type ActivityFormValues,
  ActivityFormSchema,
  activityFormMessages,
  DIFFICULTY_LABELS,
  EXAM_APPLY_NOTICE,
  EXAM_FIELD_DEFAULTS,
  formatGrade,
  formatPoints,
  hasWorkOptions,
  helpUnavailableText,
  HELP_CHECK_PENDING,
  OUT_OF_TAUGHT_SCOPE,
  QUESTION_TYPE_LABELS,
  toCreateActivityRequest,
} from "../schemas/activity-form";
import { ConfirmationField, LatePolicyField, TextareaField } from "./form-fields";
import { WorkOptionsFieldset } from "./work-options";

export const NEW_ACTIVITY_FIELD_IDS = {
  title: "atividade-titulo",
  instructions: "atividade-instrucoes",
  publishAt: "atividade-publicacao",
  deadline: "atividade-prazo",
  acknowledgeOutOfScope: "atividade-confirmar-escopo",
  controlled: "atividade-modo-controlado",
  aiHelp: "atividade-ajuda-ia",
  codeExecution: "atividade-executar-codigo",
  durationMinutes: "atividade-duracao",
  inactivityLimitSeconds: "atividade-inatividade",
  startWindowMinutes: "atividade-limite-iniciar",
} as const;
const FIELD_IDS = NEW_ACTIVITY_FIELD_IDS;

/** API answers shown next to a field (the rest goes to the summary). */
const FIELD_OF_CODE: Record<string, string> = {
  INVALID_SCHEDULE: FIELD_IDS.deadline,
  OUT_OF_SCOPE_NOT_ACKNOWLEDGED: FIELD_IDS.acknowledgeOutOfScope,
  AI_HELP_UNAVAILABLE: FIELD_IDS.aiHelp,
  CODE_EXECUTION_NOT_ELIGIBLE: FIELD_IDS.codeExecution,
};

const excerpt = (text: string) => (text.length > 120 ? `${text.slice(0, 119)}…` : text);

interface ChosenSource {
  source: ActivitySource;
  /** The work's or the exam's title, prefilled in step 2. */
  title: string;
  questionCount: number;
  /** An Exercício's total by the exercises' levels (013/FR-003); null for a Trabalho, which has a grade. */
  possiblePoints: number | null;
  /** 021: a work's CODE questions the Code Runner can run; "Permitir executar o código" only when > 0. */
  runnableCodeQuestionCount: number;
  scope: ScopeCheck;
}

/**
 * "Nova atividade" (012 contracts/web-ui.md, `/turmas/[id]/atividades/nova`, US1). Step 1: the
 * type and the source, an APPROVED work of the class's subject or 1–10 APPROVED exercises in the
 * order chosen, each with its level and fixed points and the total (013/FR-003), then the scope
 * check. Step 2: título (prefilled from the work), instruções, publication now or scheduled, prazo
 * and entrega atrasada of a Trabalho only (an Exercício has neither, 013/FR-001), and the topics not
 * yet taught with the required confirmation. A Trabalho also chooses "Como os alunos respondem"
 * (015/FR-001): the controlled mode and the AI help, disabled with its reason while unavailable
 * (FR-004). "Publicar atividade" sends one idempotency key per form, so a double click creates one
 * activity. A Prova (018/US2) comes from the APPROVED exams of the class's subject ("Prova do banco"):
 * step 1's check brings its coverage per topic and per difficulty, shown before confirming, and step 2
 * asks the duração, the limite de inatividade and the limite para iniciar, never a mode, help or deadline.
 */
export function NewActivity({ classId }: { classId: string }) {
  const schoolClass = useClass(classId);
  const [chosen, setChosen] = useState<ChosenSource | null>(null);

  if (schoolClass.isError) return <p role="alert">{messageForError(schoolClass.error)}</p>;
  if (!schoolClass.data) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Carregando…</span>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  return (
    <section aria-labelledby="nova-atividade-titulo" className="max-w-160">
      <h2 id="nova-atividade-titulo" className="m-0 mb-4 text-h2">
        Nova atividade
      </h2>
      {chosen ? (
        <ActivityDetailsStep classId={classId} chosen={chosen} onBack={() => setChosen(null)} />
      ) : (
        <SourceStep classId={classId} subjectId={schoolClass.data.subject?.id ?? null} onChosen={setChosen} />
      )}
    </section>
  );
}

function SourceStep({
  classId,
  subjectId,
  onChosen,
}: {
  classId: string;
  subjectId: string | null;
  onChosen: (chosen: ChosenSource) => void;
}) {
  const [type, setType] = useState<ActivityType>(subjectId ? "ASSIGNMENT" : "EXERCISE");
  const [workId, setWorkId] = useState("");
  const [examId, setExamId] = useState("");
  const [selected, setSelected] = useState<ExerciseTeacherView[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const works = useApprovedWorks(subjectId);
  const exams = useApprovedExams(subjectId, type === "EXAM");
  const exercises = useApprovedExercises(query);
  const scopeCheck = useScopeCheck(classId);

  const toggle = (exercise: ExerciseTeacherView, checked: boolean) =>
    setSelected((current) => (checked ? [...current, exercise] : current.filter((item) => item.id !== exercise.id)));
  const move = (index: number, offset: -1 | 1) =>
    setSelected((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset]!, next[index]!];
      return next;
    });

  const proceed = async () => {
    setError(null);
    const work: WorkSummary | undefined = works.data?.items.find((item) => item.id === workId);
    const exam: ExamSummary | undefined = exams.data?.items.find((item) => item.id === examId);
    if (type === "ASSIGNMENT" && !work) return setError("Escolha um trabalho.");
    if (type === "EXAM" && !exam) return setError("Escolha uma prova.");
    if (type === "EXERCISE" && selected.length === 0) return setError("Escolha de 1 a 10 exercícios.");
    const source: ActivitySource =
      type === "ASSIGNMENT"
        ? { type, workId }
        : type === "EXAM"
          ? { type, examId }
          : { type, exerciseIds: selected.map((exercise) => exercise.id) };
    const bankItem = work ?? exam;
    try {
      const scope = await scopeCheck.mutateAsync(source);
      onChosen({
        source,
        title: bankItem?.title ?? "",
        questionCount: bankItem ? bankItem.questionCount : selected.length,
        possiblePoints: type === "EXERCISE" ? possiblePoints(selected.map((exercise) => exercise.difficulty)) : null,
        runnableCodeQuestionCount: work?.runnableCodeQuestionCount ?? 0,
        scope,
      });
    } catch (caught) {
      setError(messageForError(caught));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup legend="Tipo de atividade">
        {ActivityTypeSchema.options.map((option) => (
          <div key={option} className="flex items-center gap-2">
            <Radio
              id={`tipo-${option}`}
              name="tipo"
              value={option}
              checked={type === option}
              disabled={option !== "EXERCISE" && !subjectId}
              onChange={() => setType(option)}
            />
            <Label htmlFor={`tipo-${option}`}>{ACTIVITY_TYPE_LABELS[option]}</Label>
          </div>
        ))}
      </RadioGroup>
      {!subjectId ? (
        <Alert variant="info">
          <AlertDescription>Esta turma não tem disciplina: só exercícios podem ser aplicados.</AlertDescription>
        </Alert>
      ) : null}

      {type === "EXAM" ? (
        exams.isPending ? (
          <p role="status">Carregando as provas aprovadas…</p>
        ) : exams.isError ? (
          <p role="alert">{messageForError(exams.error)}</p>
        ) : exams.data.items.length === 0 ? (
          <p>Nenhuma prova aprovada da disciplina desta turma.</p>
        ) : (
          <RadioGroup legend="Prova do banco (aprovadas da disciplina da turma)">
            {exams.data.items.map((exam) => (
              <div key={exam.id} className="flex items-center gap-2">
                <Radio id={`prova-${exam.id}`} name="prova" value={exam.id} checked={examId === exam.id} onChange={() => setExamId(exam.id)} />
                <Label htmlFor={`prova-${exam.id}`}>
                  {exam.title} — {exam.questionCount} {exam.questionCount === 1 ? "questão" : "questões"}, nota {formatGrade(exam.totalGrade)}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )
      ) : type === "ASSIGNMENT" ? (
        works.isPending ? (
          <p role="status">Carregando os trabalhos aprovados…</p>
        ) : works.isError ? (
          <p role="alert">{messageForError(works.error)}</p>
        ) : works.data.items.length === 0 ? (
          <p>Nenhum trabalho aprovado da disciplina desta turma.</p>
        ) : (
          <RadioGroup legend="Trabalho (aprovados da disciplina da turma)">
            {works.data.items.map((work) => (
              <div key={work.id} className="flex items-center gap-2">
                <Radio
                  id={`trabalho-${work.id}`}
                  name="trabalho"
                  value={work.id}
                  checked={workId === work.id}
                  onChange={() => setWorkId(work.id)}
                />
                <Label htmlFor={`trabalho-${work.id}`}>
                  {work.title} — {work.questionCount} {work.questionCount === 1 ? "questão" : "questões"}, nota{" "}
                  {formatGrade(work.totalGrade)}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="buscar-exercicios">Buscar exercícios aprovados</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="buscar-exercicios"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") setQuery(search);
                }}
                className="max-w-120"
              />
              <Button type="button" variant="secondary" onClick={() => setQuery(search)}>
                <Search aria-hidden="true" />
                Buscar
              </Button>
            </div>
          </div>
          {exercises.isPending ? (
            <p role="status">Carregando os exercícios aprovados…</p>
          ) : exercises.isError ? (
            <p role="alert">{messageForError(exercises.error)}</p>
          ) : exercises.data.items.length === 0 ? (
            <p>Nenhum exercício aprovado encontrado.</p>
          ) : (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 text-label text-foreground">Exercícios (de 1 a {ACTIVITY_EXERCISES_MAX})</legend>
              {exercises.data.items.map((exercise) => {
                const checked = selected.some((item) => item.id === exercise.id);
                return (
                  <div key={exercise.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`exercicio-${exercise.id}`}
                      checked={checked}
                      disabled={!checked && selected.length >= ACTIVITY_EXERCISES_MAX}
                      onChange={(event) => toggle(exercise, event.target.checked)}
                    />
                    <Label htmlFor={`exercicio-${exercise.id}`}>
                      {QUESTION_TYPE_LABELS[exercise.type]} · {DIFFICULTY_LABELS[exercise.difficulty]}: {excerpt(exercise.statement)}
                    </Label>
                  </div>
                );
              })}
            </fieldset>
          )}
          {selected.length > 0 ? (
            <div>
              <h3 className="m-0 mb-2 text-h3">Ordem das questões</h3>
              <ol className="m-0 flex flex-col gap-2 pl-6">
                {selected.map((exercise, index) => (
                  <li key={exercise.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{excerpt(exercise.statement)}</span>
                      <span className="text-text-secondary">
                        {DIFFICULTY_LABELS[exercise.difficulty]} · Vale {formatPoints(EXERCISE_POINTS[exercise.difficulty])}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Mover a questão ${index + 1} para cima`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Mover a questão ${index + 1} para baixo`}
                        disabled={index === selected.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="m-0 mt-2 font-semibold">
                Total: {formatPoints(possiblePoints(selected.map((exercise) => exercise.difficulty)))}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {error ? (
        <p role="alert" className="m-0 font-semibold text-danger-text">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" aria-busy={scopeCheck.isPending || undefined} onClick={() => void proceed()}>
          Continuar
        </Button>
        <Button asChild variant="secondary">
          <Link href={`/turmas/${classId}/atividades`}>Cancelar</Link>
        </Button>
      </div>
    </div>
  );
}

function ScopeNotice({ scope }: { scope: ScopeCheck }) {
  if (scope.outOfScope.length === 0) return null;
  return (
    <Alert variant="warning" className="mb-4">
      <AlertDescription>
        {scope.hasPlan ? null : <p className="m-0 mb-2">Esta turma não tem planejamento.</p>}
        <p className="m-0 mb-2 font-semibold">Tópicos ainda não concluídos no planejamento desta turma</p>
        <ul className="m-0 pl-6">
          {scope.outOfScope.map((item) => (
            <li key={item.syllabusItemId}>
              {item.title} (
              {item.questionPositions.length === 1 ? "questão" : "questões"}{" "}
              {item.questionPositions.map((position) => position + 1).join(", ")})
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/**
 * An exam's coverage before it is applied (018/FR-008, contracts/web-ui.md): questions and points per
 * topic, with the topics outside the class's taught scope flagged in words, and per difficulty.
 */
function ExamCoverageTables({ coverage }: { coverage: ExamCoverage }) {
  return (
    <div className="mb-4 flex flex-col gap-4">
      <Table>
        <TableCaption>Cobertura por tópico</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Tópico</TableHead>
            <TableHead scope="col">Questões</TableHead>
            <TableHead scope="col">Pontos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {coverage.byTopic.map((topic) => (
            <TableRow key={topic.syllabusItemId}>
              <TableCell>
                {topic.title}
                {topic.outOfScope ? <span className="block font-semibold text-warning-text">{OUT_OF_TAUGHT_SCOPE}</span> : null}
              </TableCell>
              <TableCell>{topic.questions}</TableCell>
              <TableCell>{formatGrade(topic.points)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Table>
        <TableCaption>Cobertura por dificuldade</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Dificuldade</TableHead>
            <TableHead scope="col">Questões</TableHead>
            <TableHead scope="col">Pontos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {coverage.byDifficulty.map((row) => (
            <TableRow key={row.difficulty}>
              <TableCell>{DIFFICULTY_LABELS[row.difficulty]}</TableCell>
              <TableCell>{row.questions}</TableCell>
              <TableCell>{formatGrade(row.points)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ActivityDetailsStep({ classId, chosen, onBack }: { classId: string; chosen: ChosenSource; onBack: () => void }) {
  const router = useRouter();
  const create = useCreateActivity(classId);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<ActivityFormValues>(FIELD_IDS);
  const { register, handleSubmit, formState, control } = useForm<ActivityFormValues>({
    shouldFocusError: false,
    resolver: zodResolver(ActivityFormSchema, { error: activityFormMessages }),
    defaultValues: {
      type: chosen.source.type,
      title: chosen.title,
      instructions: "",
      publishMode: "NOW",
      publishAt: "",
      deadline: "",
      latePolicy: "REJECT",
      needsAcknowledgement: chosen.scope.outOfScope.length > 0,
      acknowledgeOutOfScope: false,
      controlled: false,
      aiHelp: false,
      codeExecution: false,
      ...EXAM_FIELD_DEFAULTS,
    },
  });
  const isExercise = chosen.source.type === "EXERCISE";
  const isExam = chosen.source.type === "EXAM";
  const withOptions = hasWorkOptions(chosen.source.type);
  const availability = useHelpAvailability(withOptions);
  const withCodeExecution = withOptions && chosen.runnableCodeQuestionCount > 0;
  const runner = useCodeRunnerAvailability(withCodeExecution);
  const publishMode = useWatch({ control, name: "publishMode" });

  const onSubmit = handleSubmit(async (formValues) => {
    setErrors([]);
    try {
      const created = await create.mutateAsync(toCreateActivityRequest(formValues, chosen.source, idempotencyKey));
      router.push(`/turmas/${classId}/atividades/${created.id}`);
    } catch (caught) {
      const code = apiErrorCode(caught);
      setErrors([{ fieldId: code ? FIELD_OF_CODE[code] : undefined, message: messageForError(caught) }]);
    }
  }, onInvalid);

  return (
    <form
      noValidate
      aria-label="Dados da atividade"
      onSubmit={(event) => (formState.isSubmitting ? event.preventDefault() : void onSubmit(event))}
    >
      <ErrorSummary errors={errors} title="Não foi possível publicar a atividade" />
      <p className="m-0 mb-4 text-text-secondary">
        {ACTIVITY_TYPE_LABELS[chosen.source.type]} com {chosen.questionCount}{" "}
        {chosen.questionCount === 1 ? "questão" : "questões"}.
      </p>
      {chosen.possiblePoints !== null ? (
        <p className="m-0 mb-4">
          Total: {formatPoints(chosen.possiblePoints)}. Cada exercício vale os pontos do seu nível; não há nota nem prazo.
        </p>
      ) : null}
      <Field id={FIELD_IDS.title} label="Título" required autoComplete="off" error={errorFor(FIELD_IDS.title)} {...register("title")} />
      <TextareaField id={FIELD_IDS.instructions} label="Instruções" hint="Opcional." error={errorFor(FIELD_IDS.instructions)} {...register("instructions")} />
      <RadioGroup legend="Publicação" className="mb-4">
        <div className="flex items-center gap-2">
          <Radio id="publicar-agora" value="NOW" {...register("publishMode")} />
          <Label htmlFor="publicar-agora">Publicar agora</Label>
        </div>
        <div className="flex items-center gap-2">
          <Radio id="publicar-agendar" value="SCHEDULE" {...register("publishMode")} />
          <Label htmlFor="publicar-agendar">Agendar</Label>
        </div>
      </RadioGroup>
      {publishMode === "SCHEDULE" ? (
        <Field
          id={FIELD_IDS.publishAt}
          type="datetime-local"
          label="Data e hora da publicação"
          required
          error={errorFor(FIELD_IDS.publishAt)}
          {...register("publishAt")}
        />
      ) : null}
      {isExam ? (
        <>
          <p className="m-0 mb-4">{EXAM_APPLY_NOTICE}</p>
          <Field
            id={FIELD_IDS.durationMinutes}
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            label="Duração (minutos)"
            hint="De 1 a 120. Cada aluno tem a duração inteira a partir do próprio início."
            required
            error={errorFor(FIELD_IDS.durationMinutes)}
            {...register("durationMinutes")}
          />
          <Field
            id={FIELD_IDS.inactivityLimitSeconds}
            type="number"
            inputMode="numeric"
            min={30}
            max={60}
            label="Limite de inatividade (segundos)"
            hint="De 30 a 60."
            required
            error={errorFor(FIELD_IDS.inactivityLimitSeconds)}
            {...register("inactivityLimitSeconds")}
          />
          <Field
            id={FIELD_IDS.startWindowMinutes}
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            label="Limite para iniciar (minutos após a abertura)"
            hint="De 0 a 60. Depois dele, quem não iniciou não inicia mais."
            required
            error={errorFor(FIELD_IDS.startWindowMinutes)}
            {...register("startWindowMinutes")}
          />
        </>
      ) : isExercise ? null : (
        <>
          <Field
            id={FIELD_IDS.deadline}
            type="datetime-local"
            label="Prazo de entrega"
            required
            error={errorFor(FIELD_IDS.deadline)}
            {...register("deadline")}
          />
          <LatePolicyField idPrefix="atraso" {...register("latePolicy")} />
        </>
      )}
      {withOptions ? (
        <WorkOptionsFieldset
          idPrefix="atividade"
          controlled={register("controlled")}
          aiHelp={register("aiHelp")}
          helpUnavailable={availability.isPending ? HELP_CHECK_PENDING : helpUnavailableText(availability.data)}
          codeExecution={withCodeExecution ? { box: register("codeExecution"), runnerDown: runner.isError || runner.data?.available === false } : null}
        />
      ) : null}
      {chosen.scope.coverage ? <ExamCoverageTables coverage={chosen.scope.coverage} /> : <ScopeNotice scope={chosen.scope} />}
      {chosen.scope.outOfScope.length > 0 ? (
        <ConfirmationField
          id={FIELD_IDS.acknowledgeOutOfScope}
          label="Entendo e quero aplicar mesmo assim"
          error={errorFor(FIELD_IDS.acknowledgeOutOfScope)}
          {...register("acknowledgeOutOfScope")}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={formState.isSubmitting} pendingLabel={isExam ? "Aplicando…" : "Publicando…"}>
          {isExam ? "Aplicar prova" : "Publicar atividade"}
        </SubmitButton>
        <Button type="button" variant="secondary" onClick={onBack}>
          Voltar
        </Button>
      </div>
    </form>
  );
}
