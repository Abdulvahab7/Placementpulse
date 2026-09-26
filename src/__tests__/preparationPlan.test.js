import {
  prioritizeSkills,
  generatePlanSteps,
  evaluateProgression,
  applyProgress,
  failureBoost,
} from "../lib/preparationPlan.js";

const dsaSkill = { id: "dsa", name: "DSA", category: "DSA" };
const javaSkill = { id: "java", name: "Java", category: "Programming" };
const sqlSkill = { id: "sql", name: "SQL", category: "Databases" };

const skillsById = new Map([
  ["dsa", dsaSkill],
  ["java", javaSkill],
  ["sql", sqlSkill],
]);

const requirements = [
  { skillId: "dsa", importanceLevel: "HIGH" },
  { skillId: "java", importanceLevel: "HIGH" },
  { skillId: "sql", importanceLevel: "MEDIUM" },
];

const studentSkills = new Map([
  ["dsa", { evidenceScore: 52 }],
  ["java", { evidenceScore: 81 }],
  ["sql", { evidenceScore: 74 }],
]);

function failurePattern(pattern, severity = "high", overrides = {}) {
  return { failurePatternValue: pattern, severity, ...overrides };
}

describe("prioritizeSkills — high-gap skill prioritization", () => {
  it("prioritizes the skill with high requirement importance and low evidence (spec worked example)", () => {
    const prioritized = prioritizeSkills(requirements, studentSkills, skillsById, []);
    expect(prioritized[0].skillId).toBe("dsa");
  });

  it("deprioritizes a skill with strong demonstrated evidence even if importance is HIGH", () => {
    const prioritized = prioritizeSkills(requirements, studentSkills, skillsById, []);
    const java = prioritized.find((p) => p.skillId === "java");
    const dsa = prioritized.find((p) => p.skillId === "dsa");
    expect(java.priorityScore).toBeLessThan(dsa.priorityScore);
    expect(java.priority).not.toBe("HIGH");
  });

  it("boosts priority further when recurring failure patterns match the skill's category", () => {
    const failures = [failurePattern("algorithm_selection", "high"), failurePattern("edge_cases", "medium")];
    const withoutFailures = prioritizeSkills(requirements, studentSkills, skillsById, []);
    const withFailures = prioritizeSkills(requirements, studentSkills, skillsById, failures);

    const dsaWithout = withoutFailures.find((p) => p.skillId === "dsa");
    const dsaWith = withFailures.find((p) => p.skillId === "dsa");

    expect(dsaWith.priorityScore).toBeGreaterThan(dsaWithout.priorityScore);
    expect(dsaWith.matchedFailurePatterns).toContain("algorithm_selection");
    expect(dsaWith.reason).toMatch(/algorithm-selection/);
  });

  it("failureBoost is 0 when no failure pattern maps to the skill's category", () => {
    // technical_explanation maps to Interview/Communication, not Programming.
    const boost = failureBoost(javaSkill, [failurePattern("technical_explanation")]);
    expect(boost).toBe(0);
  });

  it("does not let a skill with no matching failures outrank a skill with matching high-severity failures at similar gap", () => {
    const closeRequirements = [
      { skillId: "dsa", importanceLevel: "HIGH" },
      { skillId: "java", importanceLevel: "HIGH" },
    ];
    const closeSkills = new Map([
      ["dsa", { evidenceScore: 55 }],
      ["java", { evidenceScore: 55 }],
    ]);
    const failures = [failurePattern("algorithm_selection", "high")];
    const prioritized = prioritizeSkills(closeRequirements, closeSkills, skillsById, failures);
    expect(prioritized[0].skillId).toBe("dsa");
  });
});

describe("generatePlanSteps — roadmap generation", () => {
  it("produces an ordered, sequential set of steps with only the first step unlocked", () => {
    const prioritized = prioritizeSkills(requirements, studentSkills, skillsById, []);
    const steps = generatePlanSteps(prioritized);

    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0].status).toBe("in_progress");
    expect(steps.slice(1).every((s) => s.status === "locked")).toBe(true);
    expect(steps.map((s) => s.order)).toEqual(steps.map((_, i) => i + 1));
    expect(steps[0].prerequisite).toBeNull();
    expect(steps[1].prerequisite).toBe(steps[0].stepId);
  });

  it("targets failure-specific step titles when a failure pattern matches", () => {
    const failures = [failurePattern("algorithm_selection", "high")];
    const prioritized = prioritizeSkills(requirements, studentSkills, skillsById, failures);
    const steps = generatePlanSteps(prioritized);
    const dsaSteps = steps.filter((s) => s.skillId === "dsa");
    expect(dsaSteps.some((s) => s.title.includes("Algorithm selection"))).toBe(true);
    expect(dsaSteps[0].description).toMatch(/repeated algorithm-selection errors/);
  });

  it("puts the highest-priority skill's steps first in the roadmap", () => {
    const prioritized = prioritizeSkills(requirements, studentSkills, skillsById, []);
    const steps = generatePlanSteps(prioritized);
    expect(steps[0].skillId).toBe("dsa");
  });
});

describe("evaluateProgression — progression conditions", () => {
  const assessmentStep = { activityType: "assessment" };
  const learningStep = { activityType: "learning" };

  it("non-assessment steps always progress on completion", () => {
    expect(evaluateProgression({ step: learningStep }).canProgress).toBe(true);
  });

  it("blocks progression when no assessment evidence is given", () => {
    const result = evaluateProgression({ step: assessmentStep, latestAssessmentScore: null });
    expect(result.canProgress).toBe(false);
  });

  it("blocks progression below the configured threshold", () => {
    const result = evaluateProgression({ step: assessmentStep, latestAssessmentScore: 40 });
    expect(result.canProgress).toBe(false);
  });

  it("allows progression at/above the threshold with no blocking failure", () => {
    const result = evaluateProgression({ step: assessmentStep, latestAssessmentScore: 85 });
    expect(result.canProgress).toBe(true);
  });

  it("blocks progression when an unresolved high-severity failure pattern exists, even with a passing score", () => {
    const result = evaluateProgression({
      step: assessmentStep,
      latestAssessmentScore: 90,
      unresolvedHighSeverityFailure: true,
    });
    expect(result.canProgress).toBe(false);
  });
});

describe("applyProgress — remediation branching and advancement", () => {
  function samplePlan() {
    const prioritized = prioritizeSkills(requirements, studentSkills, skillsById, []);
    const steps = generatePlanSteps(prioritized);
    return { steps, currentStep: steps[0].stepId };
  }

  it("throws when the step does not exist", () => {
    const plan = samplePlan();
    expect(() => applyProgress(plan, { stepId: "nope", completed: true })).toThrow();
  });

  it("throws when attempting progress on a locked step", () => {
    const plan = samplePlan();
    const lockedStep = plan.steps.find((s) => s.status === "locked");
    expect(() => applyProgress(plan, { stepId: lockedStep.stepId, completed: true })).toThrow();
  });

  it("advances to the next step when a non-assessment step is completed", () => {
    const plan = samplePlan();
    const first = plan.steps[0];
    const result = applyProgress(plan, { stepId: first.stepId, completed: true });
    const updatedFirst = result.steps.find((s) => s.stepId === first.stepId);
    expect(updatedFirst.status).toBe("completed");
    expect(result.currentStep).toBe(plan.steps[1].stepId);
  });

  it("inserts a remediation branch when an assessment fails and does not silently advance", () => {
    const plan = samplePlan();
    const assessmentStep = plan.steps.find((s) => s.activityType === "assessment");
    // Walk through and complete every step up to the assessment first.
    let current = plan;
    for (const step of plan.steps) {
      if (step.stepId === assessmentStep.stepId) break;
      current = { steps: current.steps, currentStep: step.stepId };
      const r = applyProgress(current, { stepId: step.stepId, completed: true });
      current = { steps: r.steps, currentStep: r.currentStep };
    }

    const failResult = applyProgress(current, {
      stepId: assessmentStep.stepId,
      completed: true,
      assessmentScore: 30,
    });

    const failedStep = failResult.steps.find((s) => s.stepId === assessmentStep.stepId);
    expect(failedStep.status).toBe("blocked");

    const remediation = failResult.steps.find(
      (s) => s.activityType === "remediation" && s.prerequisite === assessmentStep.stepId
    );
    expect(remediation).toBeDefined();
    expect(remediation.status).toBe("in_progress");
    expect(failResult.currentStep).toBe(remediation.stepId);
  });

  it("does not duplicate remediation steps on repeated failure", () => {
    const plan = samplePlan();
    const assessmentStep = plan.steps.find((s) => s.activityType === "assessment");
    let current = plan;
    for (const step of plan.steps) {
      if (step.stepId === assessmentStep.stepId) break;
      const r = applyProgress(current, { stepId: step.stepId, completed: true });
      current = { steps: r.steps, currentStep: r.currentStep };
    }

    const firstFail = applyProgress(current, { stepId: assessmentStep.stepId, completed: true, assessmentScore: 20 });
    current = { steps: firstFail.steps, currentStep: firstFail.currentStep };
    const secondFail = applyProgress(current, { stepId: assessmentStep.stepId, completed: true, assessmentScore: 25 });

    const remediationSteps = secondFail.steps.filter(
      (s) => s.activityType === "remediation" && s.prerequisite === assessmentStep.stepId
    );
    expect(remediationSteps.length).toBe(1);
  });

  it("marks the plan complete (currentStep null) once the final step is completed", () => {
    const singleStepPlan = {
      steps: [
        {
          stepId: "s1",
          order: 1,
          skillId: "dsa",
          title: "Only step",
          description: "",
          activityType: "learning",
          prerequisite: null,
          status: "in_progress",
          failurePattern: null,
          estimatedMinutes: 10,
        },
      ],
      currentStep: "s1",
    };
    const result = applyProgress(singleStepPlan, { stepId: "s1", completed: true });
    expect(result.currentStep).toBeNull();
  });
});
