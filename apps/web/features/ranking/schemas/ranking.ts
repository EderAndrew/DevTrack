/** The student's "Ranking" of a class (013 contracts/web-ui.md). */
export const classRankingHref = (classId: string) => `/minhas-turmas/${classId}/ranking`;

/** The teacher's "Ranking" of a class, a section of the class page (013 contracts/web-ui.md). */
export const teacherClassRankingHref = (classId: string) => `/turmas/${classId}/ranking`;

/** "1º", "2º": the position as the ranking shows it. */
export const formatPosition = (position: number) => `${position}º`;
