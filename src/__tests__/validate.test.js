import { jest } from "@jest/globals";
import { z } from "zod";
import { validate } from "../middleware/validate.js";

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("validate() Zod middleware", () => {
  const schema = z.object({ name: z.string().min(1), age: z.number().int().min(0) });

  it("calls next() with the parsed body when valid", () => {
    const req = { body: { name: "Ada", age: 21, extra: "stripped" } };
    const res = mockRes();
    const next = jest.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledWith(); // no error passed
    expect(req.body).toEqual({ name: "Ada", age: 21 }); // unknown fields stripped
  });

  it("calls next(err) with a 400 ApiError when invalid", () => {
    const req = { body: { name: "", age: -5 } };
    const res = mockRes();
    const next = jest.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("rejects malformed input before any downstream handler runs", () => {
    const req = { body: {} };
    const res = mockRes();
    const next = jest.fn();

    validate(schema)(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.status).toBe(400);
  });
});
