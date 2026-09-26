import { jest } from "@jest/globals";
import request from "supertest";
import { createFakeFirestore } from "../testUtils/fakeFirestore.js";

const fakeDb = createFakeFirestore();
const verifyIdToken = jest.fn();
verifyIdToken.mockImplementation(async (token) => {
  if (token === "token-alice") return { uid: "alice" };
  throw new Error("invalid");
});

jest.unstable_mockModule("../lib/firebaseAdmin.js", () => ({
  auth: { verifyIdToken },
  db: fakeDb,
  default: {},
}));

const parseJobDescription = jest.fn();
jest.unstable_mockModule("../lib/gemini.js", () => ({
  parseJobDescription,
  classifyFailure: jest.fn(),
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

describe("Demand Engine — JD parsing (/api/jd/parse)", () => {
  let roleId;

  beforeAll(async () => {
    const companyRes = await fakeDb.collection("companies").add({ name: "Demo Co", sourceType: "manual" });
    const roleRes = await fakeDb
      .collection("roles")
      .add({ companyId: companyRes.id, title: "SDE-1" });
    roleId = roleRes.id;
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).post("/api/jd/parse").send({ roleId, description: "x".repeat(30) });
    expect(res.status).toBe(401);
  });

  it("rejects a too-short description with 400 before calling Gemini", async () => {
    const res = await request(app)
      .post("/api/jd/parse")
      .set(authed("token-alice"))
      .send({ roleId, description: "too short" });
    expect(res.status).toBe(400);
    expect(parseJobDescription).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown role", async () => {
    const res = await request(app)
      .post("/api/jd/parse")
      .set(authed("token-alice"))
      .send({ roleId: "does-not-exist", description: "x".repeat(30) });
    expect(res.status).toBe(404);
  });

  it("parses a valid JD and stores requirements with sourceType = ai_inferred (never verified)", async () => {
    parseJobDescription.mockResolvedValueOnce({
      skills: [
        { skill: "Kubernetes", importance: "HIGH" },
        { skill: "Go", importance: "MEDIUM" },
      ],
    });

    const res = await request(app)
      .post("/api/jd/parse")
      .set(authed("token-alice"))
      .send({ roleId, description: "We need a backend engineer experienced with Kubernetes and Go." });

    expect(res.status).toBe(201);
    expect(res.body.data.requirements).toHaveLength(2);
    for (const r of res.body.data.requirements) {
      expect(r.sourceType).toBe("ai_inferred");
    }
  });

  it("returns 502 when Gemini output can't be validated (never stores unvalidated output)", async () => {
    const { GeminiError } = await import("../lib/gemini.js");
    parseJobDescription.mockRejectedValueOnce(new GeminiError("bad output"));

    const res = await request(app)
      .post("/api/jd/parse")
      .set(authed("token-alice"))
      .send({ roleId, description: "x".repeat(40) });

    expect(res.status).toBe(502);
  });
});
