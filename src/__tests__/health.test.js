import request from "supertest";
import { createApp } from "../app.js";

describe("GET /api/health", () => {
  it("returns ok without requiring authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
  });
});
