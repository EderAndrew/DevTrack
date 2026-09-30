import type { WorkTeacherView } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, testConfig } from "../helpers/test-app";
import {
  createWorkAiApp,
  requestWork,
  workGenerationRequest,
} from "../helpers/work-ai";
import {
  createConfirmedSyllabus,
  createWork,
  toUpdateBody,
} from "../helpers/works";

const PARALLEL = 5;
const config = {
  rateLimit: {
    ...testConfig().rateLimit,
    aiExecutionsPerMinute: 100,
    aiAgentPerHour: 100,
    workAiPerHour: 100,
  },
};

/**
 * 011/US5-6: two tabs acting on the same work — only one change counts, the others get
 * `409 WORK_VERSION_CONFLICT` (research W16: the work's version, checked under its row lock); equal
 * generation requests at once make one request (UNIQUE teacher + idempotency key).
 */
describe("011/US5-6 concorrência no banco de trabalhos", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;

  beforeAll(async () => {
    t = await createWorkAiApp({ config });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
  });

  const client = () => api(t, { cookie });
  const statuses = (responses: { status: number }[]) =>
    responses.map((res) => res.status).sort();
  const draft = async (): Promise<WorkTeacherView> => {
    const work = await createWork(t, teacher.id, {
      status: "DRAFT",
      questions: [{ type: "OPEN_ANSWER" }],
    });
    return (await client().get(`/api/works/${work.id}`))
      .body as WorkTeacherView;
  };

  it("aprovações simultâneas do mesmo trabalho → uma vale, as outras 409 WORK_VERSION_CONFLICT", async () => {
    const work = await draft();
    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, () =>
        client().post(`/api/works/${work.id}/approve`, {
          version: work.version,
        }),
      ),
    );
    expect(statuses(responses)).toEqual([
      200,
      ...Array(PARALLEL - 1).fill(409),
    ]);
    expect(
      responses
        .filter((res) => res.status === 409)
        .every((res) => res.body.code === "WORK_VERSION_CONFLICT"),
    ).toBe(true);
    expect(
      await t.prisma.auditEvent.count({ where: { type: "work.approved" } }),
    ).toBe(1);
    expect(
      await t.prisma.work.findUniqueOrThrow({ where: { id: work.id } }),
    ).toMatchObject({ status: "APPROVED", version: work.version + 1 });
  });

  it("edições simultâneas → uma vale; o título é o dela e a versão sobe uma vez", async () => {
    const work = await draft();
    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, (_, n) =>
        client().put(`/api/works/${work.id}`, {
          ...toUpdateBody(work),
          title: `Título da aba ${n}`,
        }),
      ),
    );
    expect(statuses(responses)).toEqual([
      200,
      ...Array(PARALLEL - 1).fill(409),
    ]);
    const winner = responses.find((res) => res.status === 200)!;
    const row = await t.prisma.work.findUniqueOrThrow({
      where: { id: work.id },
    });
    expect(row).toMatchObject({
      title: winner.body.title,
      version: work.version + 1,
    });
    expect(
      await t.prisma.auditEvent.count({ where: { type: "work.edited" } }),
    ).toBe(1);
  });

  it("editar e aprovar ao mesmo tempo → só um acontece", async () => {
    const work = await draft();
    const [edit, approval] = await Promise.all([
      client().put(`/api/works/${work.id}`, {
        ...toUpdateBody(work),
        title: "Editado",
      }),
      client().post(`/api/works/${work.id}/approve`, { version: work.version }),
    ]);
    expect([edit.status, approval.status].sort()).toEqual([200, 409]);
    const row = await t.prisma.work.findUniqueOrThrow({
      where: { id: work.id },
    });
    expect(row.version).toBe(work.version + 1);
    expect(row.status).toBe(edit.status === 200 ? "DRAFT" : "APPROVED");
  });

  it("dois pedidos de geração iguais ao mesmo tempo → um pedido e uma execução", async () => {
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    const body = workGenerationRequest(syllabus);
    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, () => requestWork(t, cookie, body)),
    );
    expect(
      responses.every((res) => res.status === 202 || res.status === 200),
    ).toBe(true);
    expect(new Set(responses.map((res) => res.body.id)).size).toBe(1);
    expect(await t.prisma.workGenerationRequest.count()).toBe(1);
    expect(await t.prisma.aiExecution.count()).toBe(1);
  });
});
