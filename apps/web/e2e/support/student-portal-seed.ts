import { type Browser, expect, type Page } from "@playwright/test";
import { WEB_URL } from "../env.ts";
import { unique } from "../fixtures/curriculum.ts";
import {
  type Account,
  acceptClassInvitation,
  acceptInvitationWithPassword,
  bootstrapAdmin,
  invite,
  logIn,
  newAccount,
} from "../fixtures/journeys.ts";

/** A mixed work of 5 questions (3 multiple choice, 2 open answers), 0,20 each. */
export const WORK_QUESTIONS = [
  { type: "MULTIPLE_CHOICE", statement: "Qual palavra declara herança em Java?", correct: "extends", wrong: ["implements", "inherits"] },
  { type: "OPEN_ANSWER", statement: "Explique o encapsulamento.", expectedAnswer: "GABARITO-E2E-012 esconder o estado atrás de métodos." },
  { type: "MULTIPLE_CHOICE", statement: "O que é um objeto?", correct: "Uma instância de uma classe", wrong: ["Um tipo primitivo", "Um pacote"] },
  { type: "OPEN_ANSWER", statement: "O que é polimorfismo?", expectedAnswer: "GABARITO-E2E-012 muitas formas do mesmo método." },
  { type: "MULTIPLE_CHOICE", statement: "Qual modificador restringe ao pacote?", correct: "Sem modificador", wrong: ["public", "protected"] },
] as const;

export interface StudentPortalSeed {
  teacher: Account;
  student: Account;
  classId: string;
  className: string;
  /** The subject the class offers and the work belongs to (a class of 016's attendance spec reuses it). */
  subjectId: string;
  workId: string;
  workTitle: string;
}

/**
 * Writes through the E2E API (behind the web's same-origin `/api/*` rewrite, with the session of
 * `page`): unsafe methods need the allowed `Origin` and a JSON body (OriginGuard, R6).
 */
export async function apiPost<T>(page: Page, path: string, data: object): Promise<T> {
  const res = await page.request.post(`/api${path}`, { data, headers: { Origin: WEB_URL } });
  expect(res.status(), `${path}: ${await res.text()}`).toBeLessThan(300);
  return (await res.json()) as T;
}

/**
 * 012/T071: everything the student-portal journey needs, without data of other E2E specs: a teacher
 * invited by the run's ADMIN, a subject, a class offering it, an APPROVED mixed work of that subject
 * (no topics, so nothing is out of the class's taught scope) and a student created by accepting the
 * class invitation read in Mailpit. Each actor works in its own browser context, closed at the end.
 */
export async function seedStudentPortal(browser: Browser): Promise<StudentPortalSeed> {
  const suffix = unique();
  const teacher = newAccount("portal-professor", `Professora do Portal ${suffix}`);
  const student = newAccount("portal-aluno", `Aluno do Portal ${suffix}`);

  const adminPage = await (await browser.newContext()).newPage();
  await logIn(adminPage, bootstrapAdmin(), "/professores");
  await invite(adminPage, "/professores", teacher);
  await adminPage.context().close();

  const teacherPage = await (await browser.newContext()).newPage();
  await acceptInvitationWithPassword(teacherPage, teacher);
  await logIn(teacherPage, teacher, "/disciplinas");
  const subject = await apiPost<{ id: string }>(teacherPage, "/subjects", { name: `Programação Orientada a Objetos ${suffix}` });
  const className = `Turma do Portal ${suffix}`;
  const schoolClass = await apiPost<{ id: string }>(teacherPage, "/classes", {
    name: className,
    code: `E2E-P-${suffix}`,
    academicYear: new Date().getFullYear(),
    subjectId: subject.id,
  });
  const workTitle = `Trabalho misto ${suffix}`;
  const work = await apiPost<{ id: string }>(teacherPage, "/works", {
    subjectId: subject.id,
    title: workTitle,
    totalGrade: "1.00",
    topics: null,
    status: "APPROVED",
    questions: WORK_QUESTIONS.map((question) =>
      question.type === "MULTIPLE_CHOICE"
        ? {
            type: question.type,
            statement: question.statement,
            topicItemIds: [],
            alternatives: [{ text: question.correct, isCorrect: true }, ...question.wrong.map((text) => ({ text, isCorrect: false }))],
          }
        : { type: question.type, statement: question.statement, topicItemIds: [], expectedAnswer: question.expectedAnswer },
    ),
  });
  await apiPost(teacherPage, `/classes/${schoolClass.id}/invitations`, { email: student.email });
  await teacherPage.context().close();

  const studentPage = await (await browser.newContext()).newPage();
  await acceptClassInvitation(studentPage, student);
  await studentPage.context().close();

  return { teacher, student, classId: schoolClass.id, className, subjectId: subject.id, workId: work.id, workTitle };
}

/** The teacher applies the seed's work to the class through the API (`Publicar agora`, due in a week); returns its id. */
export async function applyWorkThroughApi(browser: Browser, seed: StudentPortalSeed): Promise<string> {
  const teacherPage = await (await browser.newContext()).newPage();
  await logIn(teacherPage, seed.teacher, "/disciplinas");
  const activity = await apiPost<{ id: string }>(teacherPage, `/classes/${seed.classId}/activities`, {
    idempotencyKey: crypto.randomUUID(),
    source: { type: "ASSIGNMENT", workId: seed.workId },
    title: seed.workTitle,
    publishAt: null,
    deadline: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString(),
    latePolicy: "REJECT",
    acknowledgeOutOfScope: false,
  });
  await markAllPresentThroughApi(teacherPage, seed.classId, activity.id);
  await teacherPage.context().close();
  return activity.id;
}

/**
 * 016/US1: a work applied since 016 reaches only the students marked present. Marks every ACTIVE
 * student of the class through the attendance route (the API side of "Marcar todos → Liberar").
 */
export async function markAllPresentThroughApi(page: Page, classId: string, activityId: string): Promise<void> {
  const res = await page.request.get(`/api/classes/${classId}/activities/${activityId}/attendance`);
  expect(res.status(), await res.text()).toBe(200);
  const room = (await res.json()) as { students: { studentUserId: string; markedAt: string | null }[] };
  const mark = room.students.filter((student) => student.markedAt === null).map((student) => student.studentUserId);
  if (mark.length > 0) await apiPost(page, `/classes/${classId}/activities/${activityId}/attendance`, { mark, unmark: [] });
}

/** 016/US1 in the interface: on the work's page, "Chamada" → "Marcar todos" → "Liberar para os presentes" → "Liberar". */
export async function releaseToPresent(page: Page): Promise<void> {
  const attendance = page.getByRole("region", { name: "Chamada" });
  await expect(attendance.getByText("Aguardando chamada")).toBeVisible();
  await attendance.getByRole("button", { name: "Marcar todos", exact: true }).click();
  await attendance.getByRole("button", { name: "Liberar para os presentes" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Liberar" }).click();
  await expect(attendance.getByText(/^\d+ de \d+ presentes$/)).toBeVisible();
}
