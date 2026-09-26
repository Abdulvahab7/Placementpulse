import { jest } from "@jest/globals";
import request from "supertest";
import { createFakeFirestore } from "../testUtils/fakeFirestore.js";

const fakeDb = createFakeFirestore();
const verifyIdToken = jest.fn();

verifyIdToken.mockImplementation(async (token) => {
  if (token === "token-alice") return { uid: "alice" };
  if (token === "token-bob") return { uid: "bob" };
  throw new Error("invalid");
});

jest.unstable_mockModule("../lib/firebaseAdmin.js", () => ({
  auth: { verifyIdToken },
  db: fakeDb,
  default: {},
}));

const { createApp } = await import("../app.js");
const app = createApp();

function authed(token) {
  return { Authorization: `Bearer ${token}` };
}

async function seedReferenceData() {
  await fakeDb.collection("skills").doc("dsa").set({ name: "DSA", category: "DSA" });
  await fakeDb.collection("skills").doc("java").set({ name: "Java", category: "Programming" });
  await fakeDb.collection("skills").doc("sql").set({ name: "SQL", category: "Databases" });

  await fakeDb.collection("companies").doc("acme").set({ name: "Acme", sourceType: "manual" });
  await fakeDb.collection("roles").doc("sde-role").set({ companyId: "acme", title: "Software Developer" });

  await fakeDb.collection("roleRequirements").add({
    roleId: "sde-role",
    skillId: "dsa",
    importanceLevel: "HIGH",
    sourceType: "historical",
  });
  await fakeDb.collection("roleRequirements").add({
    roleId: "sde-role",
    skillId: "java",
    importanceLevel: "HIGH",
    sourceType: "historical",
  });
  await fakeDb.collection("roleRequirements").add({
    roleId: "sde-role",
    skillId: "sql",
    importanceLevel: "MEDIUM",
    sourceType: "historical",
  });
}

beforeAll(async () => {
  await seedReferenceData();
});

describe("POST /api/preparation-plans — generation, auth, validation", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app).post("/api/preparation-plans").send({ roleId: "sde-role" });
    expect(res.status).toBe(401);
  });

  it("rejects a request missing roleId", async () => {
    const res = await request(app).post("/api/preparation-plans").set(authed("token-alice")).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("404s for a role that doesn't exist", async () => {
    const res = await request(app)
      .post("/api/preparation-plans")
      .set(authed("token-alice"))
      .send({ roleId: "does-not-exist" });
    expect(res.status).toBe(404);
  });

  it("generates a real plan from evidence, prioritizing the low-evidence high-importance skill first", async () => {
    await fakeDb.collection("studentSkills").add({ userId: "alice", skillId: "dsa", evidenceScore: 52 });
    await fakeDb.collection("studentSkills").add({ userId: "alice", skillId: "java", evidenceScore: 81 });
    await fakeDb.collection("studentSkills").add({ userId: "alice", skillId: "sql", evidenceScore: 74 });
    await fakeDb.collection("failurePatterns").add({
      userId: "alice",
      attemptId: "a1",
      failurePatternValue: "algorithm_selection",
      severity: "high",
      confidence: 0.8,
    });

    const res = await request(app)
      .post("/api/preparation-plans")
      .set(authed("token-alice"))
      .send({ roleId: "sde-role" });

    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe("alice");
    expect(res.body.data.prioritization[0].skillId).toBe("dsa");
    expect(res.body.data.steps.length).toBeGreaterThan(0);
    expect(res.body.data.steps[0].status).toBe("in_progress");
    expect(res.body.data.currentStep).toBe(res.body.data.steps[0].stepId);
  });
});

describe("GET/POST /api/preparation-plans/:planId — access control and progress", () => {
  let alicePlanId;
  let firstStepId;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/preparation-plans")
      .set(authed("token-alice"))
      .send({ roleId: "sde-role" });
    alicePlanId = res.body.data.id;
    firstStepId = res.body.data.steps[0].stepId;
  });

  it("lets the owner fetch their plan", async () => {
    const res = await request(app).get(`/api/preparation-plans/${alicePlanId}`).set(authed("token-alice"));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(alicePlanId);
  });

  it("prevents another user from reading someone else's plan (isolation)", async () => {
    const res = await request(app).get(`/api/preparation-plans/${alicePlanId}`).set(authed("token-bob"));
    expect(res.status).toBe(403);
  });

  it("prevents another user from posting progress on someone else's plan (isolation)", async () => {
    const res = await request(app)
      .post(`/api/preparation-plans/${alicePlanId}/progress`)
      .set(authed("token-bob"))
      .send({ stepId: firstStepId, completed: true });
    expect(res.status).toBe(403);
  });

  it("404s for a plan that doesn't exist", async () => {
    const res = await request(app).get("/api/preparation-plans/nope").set(authed("token-alice"));
    expect(res.status).toBe(404);
  });

  it("rejects malformed progress payloads", async () => {
    const res = await request(app)
      .post(`/api/preparation-plans/${alicePlanId}/progress`)
      .set(authed("token-alice"))
      .send({ completed: true }); // missing stepId
    expect(res.status).toBe(400);
  });

  it("advances the plan when the owner completes the first (non-assessment) step", async () => {
    const res = await request(app)
      .post(`/api/preparation-plans/${alicePlanId}/progress`)
      .set(authed("token-alice"))
      .send({ stepId: firstStepId, completed: true });

    expect(res.status).toBe(200);
    const updatedFirst = res.body.data.steps.find((s) => s.stepId === firstStepId);
    expect(updatedFirst.status).toBe("completed");
    expect(res.body.data.currentStep).not.toBe(firstStepId);
  });

  it("triggers remediation branching when an assessment step fails, visible in the returned roadmap", async () => {
    // Walk forward completing steps until we reach the assessment step for the top-priority skill.
    let planRes = await request(app).get(`/api/preparation-plans/${alicePlanId}`).set(authed("token-alice"));
    let plan = planRes.body.data;

    let assessmentStep = plan.steps.find((s) => s.activityType === "assessment" && s.status !== "completed");
    while (plan.currentStep && plan.currentStep !== assessmentStep.stepId) {
      const stepRes = await request(app)
        .post(`/api/preparation-plans/${alicePlanId}/progress`)
        .set(authed("token-alice"))
        .send({ stepId: plan.currentStep, completed: true });
      plan = stepRes.body.data;
    }

    const failRes = await request(app)
      .post(`/api/preparation-plans/${alicePlanId}/progress`)
      .set(authed("token-alice"))
      .send({ stepId: assessmentStep.stepId, completed: true, assessmentScore: 30 });

    expect(failRes.status).toBe(200);
    const failedStep = failRes.body.data.steps.find((s) => s.stepId === assessmentStep.stepId);
    expect(failedStep.status).toBe("blocked");
    const remediation = failRes.body.data.steps.find(
      (s) => s.activityType === "remediation" && s.prerequisite === assessmentStep.stepId
    );
    expect(remediation).toBeDefined();
  });
});

describe("POST /api/preparation-plans/:planId/regenerate", () => {
  it("regenerates the plan and preserves ownership/authorization checks", async () => {
    const genRes = await request(app)
      .post("/api/preparation-plans")
      .set(authed("token-bob"))
      .send({ roleId: "sde-role" });
    const planId = genRes.body.data.id;

    const forbidden = await request(app)
      .post(`/api/preparation-plans/${planId}/regenerate`)
      .set(authed("token-alice"));
    expect(forbidden.status).toBe(403);

    const ownerRes = await request(app)
      .post(`/api/preparation-plans/${planId}/regenerate`)
      .set(authed("token-bob"));
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.data.id).toBe(planId);
    expect(ownerRes.body.data.createdAt).toBe(genRes.body.data.createdAt);
  });
});

describe("GET /api/preparation-plans/role/:roleId", () => {
  it("returns null when no plan exists yet for that role", async () => {
    await fakeDb.collection("roles").doc("other-role").set({ companyId: "acme", title: "Other" });
    const res = await request(app)
      .get("/api/preparation-plans/role/other-role")
      .set(authed("token-alice"));
    expect(res.status).toBe(200);
    expect(res.body.data.plan).toBeNull();
  });

  it("returns the active plan for that role when one exists", async () => {
    const res = await request(app)
      .get("/api/preparation-plans/role/sde-role")
      .set(authed("token-alice"));
    expect(res.status).toBe(200);
    expect(res.body.data.plan).not.toBeNull();
    expect(res.body.data.plan.roleId).toBe("sde-role");
  });
});
