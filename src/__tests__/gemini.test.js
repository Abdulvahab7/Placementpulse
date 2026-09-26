import { jest } from "@jest/globals";
import { geminiFailureClassificationSchema, geminiJdParseSchema } from "../schemas/index.js";
import { parseJobDescription, classifyFailure, GeminiError } from "../lib/gemini.js";

function mockGeminiResponse(jsonText) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: jsonText }] } }] }),
  };
}

describe("Gemini schema validation (never store unvalidated AI output)", () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalKey;
  });

  it("accepts a well-formed JD-parse response", () => {
    const result = geminiJdParseSchema.safeParse({ skills: [{ skill: "Go", importance: "HIGH" }] });
    expect(result.success).toBe(true);
  });

  it("rejects a JD-parse response with an invalid importance value", () => {
    const result = geminiJdParseSchema.safeParse({ skills: [{ skill: "Go", importance: "URGENT" }] });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed failure-classification response", () => {
    const result = geminiFailureClassificationSchema.safeParse({
      failure_pattern: "edge_cases",
      confidence: 0.6,
      evidence: ["failed on boundary inputs"],
      intervention: "practice boundary-condition tests",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a failure-classification response with an unknown failure_pattern", () => {
    const result = geminiFailureClassificationSchema.safeParse({
      failure_pattern: "laziness",
      confidence: 0.6,
      evidence: ["x"],
      intervention: "y",
    });
    expect(result.success).toBe(false);
  });

  it("parseJobDescription retries once on invalid JSON, then succeeds on the retry", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(mockGeminiResponse("not json at all"))
      .mockResolvedValueOnce(mockGeminiResponse(JSON.stringify({ skills: [{ skill: "Rust", importance: "LOW" }] })));

    const result = await parseJobDescription("some JD text that is long enough to pass validation checks");
    expect(result.skills[0].skill).toBe("Rust");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("parseJobDescription throws GeminiError (never returns unvalidated data) when both attempts fail", async () => {
    global.fetch = jest.fn().mockResolvedValue(mockGeminiResponse("still not json"));
    await expect(parseJobDescription("some JD text that is long enough")).rejects.toBeInstanceOf(GeminiError);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("classifyFailure rejects a schema-invalid Gemini response on both attempts", async () => {
    global.fetch = jest.fn().mockResolvedValue(mockGeminiResponse(JSON.stringify({ failure_pattern: "nonsense" })));
    await expect(classifyFailure({ signals: {} })).rejects.toBeInstanceOf(GeminiError);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
