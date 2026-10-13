// No "use client": the page (a Server Component) reads `?aba=` through `activityTabOf`.

/**
 * The tabs of an activity's page, in order, with the `?aba=` value of each (012 contracts/web-ui.md,
 * amendment 2026-10-11): the activity's data with its edit, the attendance with the students, and the
 * questions with the answer key.
 */
export const ACTIVITY_TABS = {
  informacoes: "Informações",
  alunos: "Alunos",
  questoes: "Questões e gabarito",
} as const;
export type ActivityTab = keyof typeof ACTIVITY_TABS;

/** The students' tab of a work that takes attendance (016): the "Chamada" comes before the roster. */
export const ATTENDANCE_AND_STUDENTS = "Chamada e alunos";

/** The students' tab of an EXAM (018 contracts/web-ui.md): the "Chamada" and the exam in progress; it opens first. */
export const ATTENDANCE_AND_EXAM = "Chamada e prova";

export const isActivityTab = (value: unknown): value is ActivityTab => typeof value === "string" && Object.hasOwn(ACTIVITY_TABS, value);

/** The tab a `?aba=` value opens; anything else leaves it to the activity (Informações, or an EXAM's "Chamada e prova"). */
export const activityTabOf = (value: unknown): ActivityTab | undefined => (isActivityTab(value) ? value : undefined);

/** The activity's page on one tab (the attempt review links back to "alunos"). */
export const activityTabHref = (classId: string, activityId: string, tab: ActivityTab) => `/turmas/${classId}/atividades/${activityId}?aba=${tab}`;
