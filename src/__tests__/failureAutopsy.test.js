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

const classifyFailure = jest.fn();
jest.unstable_mockModule("../lib/gemini.js", () => ({
  parseJobDescription: jest.fn(),
  classifyFailure,
  GeminiError: class GeminiError extends Error {
    constructor(message) {
      super(message);
      this.name = "GeminiError";
    }
  },
}));

const { createApp } = await import("../app.js");
const app = createApp();

function authed(token) {
  return { Authorization: `Bearer ${token}` };
}

describe("Failure Autopsy (/api/failure-autopsy)", () => {
  let failedAttemptId;
  let correctAttemptId;
  let bobsAttemptId;

  beforeAll(async () => {
    const failed = await fakeDb.collection("attempts").add({
      userId: "alice",
      type: "coding",
      questionId: "q1",
      answer: "...",
      correct: false,
      timeTaken: 40,
      contextType: "coding",
      chosenApproach: "",
      actualComplexity: "O(n^2)",
      expectedComplexity: "O(n log n)",
    });
    failedAttemptId = failed.id;

    const correct = await fakeDb.collection("attempts").add({
      userId: "alice",
      type: "coding",
      questionId: "q2",
      answer: "...",
      correct: true,
      timeTaken: 10,
    });
    correctAttemptId = correct.id;

    const bobs = await fakeDb.collection("attempts").add({
      userId: "bob",
      type: "coding",
      questionId: "q3",
      answer: "...",
      correct: false,
      timeTaken: 10,
    });
    bobsAttemptId = bobs.id;
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).post("/api/failure-autopsy/analyze").send({ attemptId: failedAttemptId });
    expect(res.status).toBe(401);
  });

  it("refuses to analyze another user's attempt (isolation)", async () => {
    const res = await request(app)
      .post("/api/failure-autopsy/analyze")
      .set(authed("token-alice"))
      .send({ attemptId: bobsAttemptId });
    expect(res.status).toBe(403);
  });

  it("refuses to analyze a correct (non-failed) attempt", async () => {
    const res = await request(app)
      .post("/api/failure-autopsy/analyze")
      .set(authed("token-alice"))
      .send({ attemptId: correctAttemptId });
    expect(res.status).toBe(400);
  });

  it("runs the pipeline: deterministic signals -> Gemini -> validated -> stored", async () => {
    classifyFailure.mockResolvedValueOnce({
      failure_pattern: "algorithm_selection",
      confidence: 0.82,
      evidence: ["Chosen approach was O(n^2) against an O(n log n) requirement"],
      intervention: "Practice recognizing when sorting unlocks a better approach.",
    });

    const res = await request(app)
      .post("/api/failure-autopsy/analyze")
      .set(authed("token-alice"))
      .send({ attemptId: failedAttemptId });

    expect(res.status).toBe(201);
    expect(res.body.data.failurePatternValue).toBe("algorithm_selection");
    expect(res.body.data.severity).toBe("high");
    expect(res.body.data.deterministicSignals.algorithmSelectionRisk.risk).toBe(true);

    // Gemini must only receive the structured evidence bundle, never raw answer text.
    const sentPrompt = classifyFailure.mock.calls[0][0];
    expect(JSON.stringify(sentPrompt)).not.toContain("...");
  });

  it("returns 502 and stores nothing when Gemini output fails validation twice", async () => {
    const { GeminiError } = await import("../lib/gemini.js");
    classifyFailure.mockRejectedValueOnce(new GeminiError("invalid"));

    const before = (await fakeDb.collection("failurePatterns").get()).docs.length;
    const res = await request(app)
      .post("/api/failure-autopsy/analyze")
      .set(authed("token-alice"))
      .send({ attemptId: failedAttemptId });
    const after = (await fakeDb.collection("failurePatterns").get()).docs.length;

    expect(res.status).toBe(502);
    expect(after).toBe(before);
  });

  it("aggregates failure categories and identifies the primary recurring issue", async () => {
    const res = await request(app).get("/api/failure-autopsy").set(authed("token-alice"));
    expect(res.status).toBe(200);
    expect(res.body.data.attemptsAnalyzed).toBeGreaterThanOrEqual(1);
    expect(res.body.data.primaryRecurringIssue.pattern).toBe("algorithm_selection");
  });

  it("computes a failure fingerprint with observable instance counts only", async () => {
    const res = await request(app).get("/api/failure-autopsy/fingerprint").set(authed("token-alice"));
    expect(res.status).toBe(200);
    expect(res.body.data.fingerprint[0].pattern).toBe("algorithm_selection");
    expect(res.body.data.fingerprint[0].instances).toBeGreaterThanOrEqual(1);
  });
});
