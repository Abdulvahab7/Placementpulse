import { jest } from "@jest/globals";
import request from "supertest";
import { createFakeFirestore } from "../testUtils/fakeFirestore.js";

const fakeDb = createFakeFirestore();
const verifyIdToken = jest.fn();

// Map fake bearer tokens straight to uids for test simplicity.
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

describe("owned collection routes (/api/attempts) — CRUD + isolation", () => {
  let aliceAttemptId;

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/attempts");
    expect(res.status).toBe(401);
  });

  it("creates an attempt owned by the authenticated user (basic CRUD: create)", async () => {
    const res = await request(app)
      .post("/api/attempts")
      .set(authed("token-alice"))
      .send({
        type: "mcq",
        questionId: "q1",
        answer: "B",
        correct: true,
        timeTaken: 12.5,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe("alice");
    aliceAttemptId = res.body.data.id;
  });

  it("rejects malformed input with 400 (Zod validation)", async () => {
    const res = await request(app)
      .post("/api/attempts")
      .set(authed("token-alice"))
      .send({ type: "mcq" }); // missing required fields

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("lists only the caller's own attempts (basic CRUD: read)", async () => {
    await request(app)
      .post("/api/attempts")
      .set(authed("token-bob"))
      .send({ type: "mcq", questionId: "q2", answer: "A", correct: false, timeTaken: 5 });

    const aliceList = await request(app).get("/api/attempts").set(authed("token-alice"));
    const bobList = await request(app).get("/api/attempts").set(authed("token-bob"));

    expect(aliceList.body.data).toHaveLength(1);
    expect(bobList.body.data).toHaveLength(1);
    expect(aliceList.body.data[0].userId).toBe("alice");
    expect(bobList.body.data[0].userId).toBe("bob");
  });

  it("prevents user B from reading user A's private attempt (isolation)", async () => {
    const res = await request(app)
      .get(`/api/attempts/${aliceAttemptId}`)
      .set(authed("token-bob"));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("prevents user B from deleting user A's attempt (isolation)", async () => {
    const res = await request(app)
      .delete(`/api/attempts/${aliceAttemptId}`)
      .set(authed("token-bob"));

    expect(res.status).toBe(403);
  });

  it("allows user A to update and delete their own attempt (basic CRUD: update/delete)", async () => {
    const patchRes = await request(app)
      .patch(`/api/attempts/${aliceAttemptId}`)
      .set(authed("token-alice"))
      .send({ hintsUsed: 2 });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.hintsUsed).toBe(2);

    const delRes = await request(app)
      .delete(`/api/attempts/${aliceAttemptId}`)
      .set(authed("token-alice"));
    expect(delRes.status).toBe(200);
    expect(delRes.body.data.deleted).toBe(true);
  });
});
