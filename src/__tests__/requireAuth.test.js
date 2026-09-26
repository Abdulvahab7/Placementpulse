import { jest } from "@jest/globals";

const verifyIdToken = jest.fn();

jest.unstable_mockModule("../lib/firebaseAdmin.js", () => ({
  auth: { verifyIdToken },
  db: {},
  default: {},
}));

const { requireAuth } = await import("../middleware/requireAuth.js");

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("requireAuth middleware", () => {
  beforeEach(() => verifyIdToken.mockReset());

  it("rejects requests with no Authorization header", async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a malformed Authorization header", async () => {
    const req = { headers: { authorization: "Basic abc123" } };
    const res = mockRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an invalid/expired token", async () => {
    verifyIdToken.mockRejectedValueOnce(new Error("invalid token"));
    const req = { headers: { authorization: "Bearer bad.token.here" } };
    const res = mockRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches req.user and calls next() for a valid token", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "user-123", email: "a@b.com", email_verified: true });
    const req = { headers: { authorization: "Bearer good.token.here" } };
    const res = mockRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ uid: "user-123", email: "a@b.com", emailVerified: true });
  });

  it("never trusts a client-supplied userId — req.user.uid always comes from the verified token", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "real-uid-from-token" });
    const req = {
      headers: { authorization: "Bearer good.token.here" },
      body: { userId: "attacker-supplied-uid" },
    };
    const res = mockRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(req.user.uid).toBe("real-uid-from-token");
    expect(req.user.uid).not.toBe(req.body.userId);
  });
});
