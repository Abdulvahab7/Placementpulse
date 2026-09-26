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

const parseJobDescription = jest.fn().mockResolvedValue({ skills: [{ skill: "Go", importance: "HIGH" }] });
jest.unstable_mockModule("../lib/gemini.js", () => ({
  parseJobDescription,
  classifyFailure: jest.fn(),
  GeminiError: class GeminiError extends Error {},
}));

const { createApp } = await import("../app.js");
const app = createApp();

function authed(token) {
  return { Authorization: `Bearer ${token}` };
}

describe("Rate limiting on AI-cost-bearing endpoints (/api/jd/parse)", () => {
  it("allows requests under the limit and blocks with 429 once the limit is exceeded", async () => {
    const companyRes = await fakeDb.collection("companies").add({ name: "RL Co" });
    const roleRes = await fakeDb.collection("roles").add({ companyId: companyRes.id, title: "SDE" });
    const roleId = roleRes.id;

    let lastStatus;
    for (let i = 0; i < 11; i++) {
      const res = await request(app)
        .post("/api/jd/parse")
        .set(authed("token-alice"))
        .send({ roleId, description: "x".repeat(30) });
      lastStatus = res.status;
      if (i < 10) {
        expect(res.status).not.toBe(429);
      }
    }
    expect(lastStatus).toBe(429);
  });
});
