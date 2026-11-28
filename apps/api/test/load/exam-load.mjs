// Exam load test: N students take one exam at the same time through the web's /api proxy, as the browser does.
// Seed first (test/load/exam.seed.ts), then: node test/load/exam-load.mjs <seed.json>
// Env: BASE_URL (default http://localhost:3100), STEADY_SEC (240), LAST_MINUTE_SEC (60), CLIENT_IP (one NAT address
// for the whole classroom, sent as X-Forwarded-For the way nginx does), TYPO_STUDENTS (students who mistype the
// password once, 10), OUT (where to write the JSON summary).
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const seed = JSON.parse(readFileSync(process.argv[2], "utf8"));
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const STEADY_SEC = Number(process.env.STEADY_SEC ?? 240);
const LAST_MINUTE_SEC = Number(process.env.LAST_MINUTE_SEC ?? 60);
const CLIENT_IP = process.env.CLIENT_IP ?? "200.10.20.30";
const TYPO_STUDENTS = Number(process.env.TYPO_STUDENTS ?? 10);
const POLL_MS = 5_000;
const ORIGIN = new URL(BASE).origin;

const stats = new Map(); // route → { latencies: [], status: {} }
const record = (route, ms, status) => {
  const entry = stats.get(route) ?? { latencies: [], status: {} };
  entry.latencies.push(ms);
  entry.status[status] = (entry.status[status] ?? 0) + 1;
  stats.set(route, entry);
};

async function call(session, method, path, route, body) {
  const headers = { Origin: ORIGIN, "X-Forwarded-For": CLIENT_IP };
  if (session.cookie) headers.Cookie = session.cookie;
  if (method !== "GET") headers["Content-Type"] = "application/json";
  const started = performance.now();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
  } catch {
    record(route, performance.now() - started, "NETWORK");
    return { status: 0, body: null };
  }
  const text = await res.text();
  record(route, performance.now() - started, res.status);
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookie) if (cookie.startsWith("__Host-devtrack_session=")) session.cookie = cookie.split(";")[0];
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (ms) => ms * (0.75 + Math.random() * 0.5);

// ── Teacher: apply the exam and mark everybody present ─────────────────────────────────────────
const teacher = { cookie: null };
const login = await call(teacher, "POST", "/api/auth/login", "auth.login", { email: seed.teacherEmail, password: seed.password });
if (login.status !== 200) throw new Error(`teacher login ${login.status} ${JSON.stringify(login.body)}`);
const applied = await call(teacher, "POST", `/api/classes/${seed.classId}/activities`, "teacher.apply", {
  idempotencyKey: randomUUID(),
  source: { type: "EXAM", examId: seed.examId },
  title: "Prova de carga",
  instructions: "Leia as regras.",
  publishAt: null,
  durationMinutes: 30,
  startWindowMinutes: 30,
  acknowledgeOutOfScope: true,
});
if (applied.status !== 201) throw new Error(`apply ${applied.status} ${JSON.stringify(applied.body)}`);
const activityId = applied.body.id;
const room = await call(teacher, "GET", `/api/classes/${seed.classId}/activities/${activityId}/attendance`, "teacher.room");
const ids = room.body.students.map((student) => student.studentUserId);
const marked = await call(teacher, "POST", `/api/classes/${seed.classId}/activities/${activityId}/attendance`, "teacher.mark", { mark: ids, unmark: [] });
if (marked.status !== 200) throw new Error(`attendance ${marked.status} ${JSON.stringify(marked.body)}`);
console.log(`exam ${activityId} applied, ${ids.length} present`);

// ── Students ────────────────────────────────────────────────────────────────────────────────────
const phase = { name: "login" };
const problems = [];

function answerFor(question, text) {
  if (question.type === "MULTIPLE_CHOICE") return { kind: "ALTERNATIVE", alternativeId: question.alternatives[0]?.id ?? null };
  if (question.type === "CODE") return { kind: "CODE", source: text };
  return { kind: "TEXT", text };
}

async function student(email, index, startGate) {
  const session = { cookie: null };
  if (index < TYPO_STUDENTS) await call(session, "POST", "/api/auth/login", "auth.login(senha errada)", { email, password: "senha-errada-123" });
  let res = await call(session, "POST", "/api/auth/login", "auth.login", { email, password: seed.password });
  if (res.status !== 200) {
    problems.push(`${index} login ${res.status} ${res.body?.code ?? ""}`);
    return;
  }
  await call(session, "GET", "/api/me", "me");
  await call(session, "GET", "/api/me/activities", "me.activities");
  await call(session, "GET", `/api/me/activities/${activityId}`, "me.activity");
  await startGate;

  phase.name === "login" && (phase.name = "start");
  res = await call(session, "POST", `/api/me/activities/${activityId}/attempt`, "exam.start", { acceptRules: true });
  if (res.status !== 200 && res.status !== 201) {
    problems.push(`${index} start ${res.status} ${res.body?.code ?? ""}`);
    return;
  }
  res = await call(session, "GET", `/api/me/activities/${activityId}`, "me.activity");
  const questions = res.body?.questions ?? [];
  const revisions = new Map(questions.map((question) => [question.id, 0]));
  const texts = new Map(questions.map((question) => [question.id, ""]));
  const pending = new Map(); // questionId → answer, unsent

  let stop = false;
  const poll = (async () => {
    await sleep(Math.random() * POLL_MS);
    while (!stop) {
      await call(session, "GET", `/api/me/activities/${activityId}/attempt/exam-nudge`, "exam.nudgePoll");
      await sleep(POLL_MS);
    }
  })();

  let saving = false;
  async function save(route) {
    if (saving || pending.size === 0) return;
    saving = true;
    const answers = [...pending].map(([questionId, answer]) => ({ questionId, answer, baseRevision: revisions.get(questionId) }));
    pending.clear();
    const result = await call(session, "PUT", `/api/me/activities/${activityId}/attempt/answers`, route, { answers });
    if (result.status === 200) {
      for (const item of result.body.results) {
        revisions.set(item.questionId, item.revision);
        if (item.outcome !== "SAVED" && item.outcome !== "UNCHANGED") problems.push(`${index} save ${item.outcome}`);
      }
    } else {
      for (const answer of answers) if (!pending.has(answer.questionId)) pending.set(answer.questionId, answer.answer);
    }
    saving = false;
  }

  // One focus event per student, as a short screen exit would send (a warning, never a hold).
  setTimeout(() => {
    const now = new Date().toISOString();
    void call(session, "POST", `/api/me/activities/${activityId}/attempt/events`, "exam.events", {
      events: [
        { eventId: randomUUID(), type: "SCREEN_LEFT", clientOccurredAt: now, buffered: false },
        { eventId: randomUUID(), type: "SCREEN_RETURNED", clientOccurredAt: now, buffered: false },
      ],
    });
  }, Math.random() * STEADY_SEC * 1000);

  // Steady phase: the student answers question after question, typing ~4 characters a second; the save goes
  // 1.5 s after a pause in the typing (SAVE_DEBOUNCE_MS), as the browser does.
  const steadyEnd = Date.now() + STEADY_SEC * 1000;
  let q = 0;
  while (Date.now() < steadyEnd) {
    const question = questions[q % questions.length];
    q += 1;
    const words = 2 + Math.floor(Math.random() * 6);
    for (let w = 0; w < words && Date.now() < steadyEnd; w += 1) {
      const chunk = question.type === "MULTIPLE_CHOICE" ? "" : `palavra${w} `;
      texts.set(question.id, texts.get(question.id) + chunk);
      pending.set(question.id, answerFor(question, texts.get(question.id)));
      await sleep(jitter(chunk.length * 250 || 2000)); // typing
      await sleep(jitter(1500)); // the pause that triggers the debounced save
      await save("exam.save");
      await sleep(jitter(4000)); // reading, thinking
    }
  }

  // The exam's last minute: every change is saved at once (no debounce), one save in flight at a time.
  phase.name = "lastMinute";
  const lastEnd = Date.now() + LAST_MINUTE_SEC * 1000;
  const question = questions.find((item) => item.type !== "MULTIPLE_CHOICE") ?? questions[0];
  while (Date.now() < lastEnd) {
    texts.set(question.id, `${texts.get(question.id)}x`);
    pending.set(question.id, answerFor(question, texts.get(question.id)));
    void save("exam.save(último minuto)");
    await sleep(jitter(250)); // ~4 keystrokes a second
  }
  while (saving) await sleep(50);

  phase.name = "submit";
  const answers = [...pending].map(([questionId, answer]) => ({ questionId, answer, baseRevision: revisions.get(questionId) }));
  res = await call(session, "POST", `/api/me/activities/${activityId}/attempt/submit`, "exam.submit", { answers });
  if (res.status !== 200 && res.status !== 201) problems.push(`${index} submit ${res.status} ${res.body?.code ?? ""}`);
  stop = true;
  await poll;
}

// Everyone logs in within the same few seconds, then the exam is released together.
let release;
const startGate = new Promise((resolve) => (release = resolve));
const started = Date.now();
const runs = seed.students.map((email, index) => sleep(Math.random() * 3000).then(() => student(email, index, startGate)));
await sleep(6000);
console.log("start");
release();

// The teacher watches the room every 5 s while the exam runs.
let teacherStop = false;
const teacherPoll = (async () => {
  while (!teacherStop) {
    await call(teacher, "GET", `/api/classes/${seed.classId}/activities/${activityId}/exam-monitor`, "teacher.examMonitor");
    await sleep(POLL_MS);
  }
})();

await Promise.all(runs);
teacherStop = true;
await teacherPoll;

// ── Summary ─────────────────────────────────────────────────────────────────────────────────────
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const rows = [...stats].map(([route, { latencies, status }]) => {
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    route,
    n: sorted.length,
    p50: Math.round(pct(sorted, 50)),
    p95: Math.round(pct(sorted, 95)),
    p99: Math.round(pct(sorted, 99)),
    max: Math.round(sorted[sorted.length - 1]),
    status,
  };
});
const total = rows.reduce((sum, row) => sum + row.n, 0);
const seconds = (Date.now() - started) / 1000;
const summary = { students: seed.students.length, seconds: Math.round(seconds), requests: total, rps: +(total / seconds).toFixed(1), rows, problems };
console.table(rows.map(({ status, ...row }) => ({ ...row, status: JSON.stringify(status) })));
console.log(`total ${total} requests in ${Math.round(seconds)} s (${summary.rps} req/s); problems: ${problems.length}`);
for (const problem of problems.slice(0, 30)) console.log("  ", problem);
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(summary, null, 2));
