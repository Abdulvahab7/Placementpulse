# Firestore Data Model — Phase 1

These are the canonical collection names and shapes. Later phases must reuse
these exactly — do not create alternate collections.

```ts
interface User {
  userId: string;        // == Firebase Auth uid, also the doc ID
  name: string;
  college: string;
  branch: string;
  year: number;
  email: string;
  targetRoles: string[];
  resumeUrl?: string | null;
}

interface Skill {
  skillId: string;        // doc ID
  name: string;
  category: string;
}

interface StudentSkill {
  userId: string;
  skillId: string;
  evidenceScore: number;  // 0–100
  confidence: number;     // 0–1
  lastAssessed?: string;  // ISO datetime
}

interface Company {
  companyId: string;       // doc ID
  name: string;
  sourceType: "manual" | "scraped" | "partner";
}

interface Role {
  roleId: string;           // doc ID
  companyId: string;
  title: string;
}

interface RoleRequirement {
  roleId: string;
  skillId: string;
  importance: number;      // 0–1
  sourceType: "manual" | "scraped" | "partner";
}

interface Attempt {
  attemptId: string;        // doc ID
  userId: string;
  type: string;
  questionId: string;
  answer: string;
  correct: boolean;
  timeTaken: number;
  hintsUsed: number;
  attemptsCount: number;
}

interface FailurePattern {
  userId: string;
  pattern: string;
  frequency: number;
  severity: "low" | "medium" | "high";
  evidence: string[];
  lastDetected?: string;
}

interface Intervention {
  userId: string;
  failurePattern: string;
  activity: string;
  status: "pending" | "in_progress" | "completed";
  result?: string | null;
}

interface Readiness {
  userId: string;
  roleId: string;
  overall: number;         // 0–100
  skillGaps: string[];
  updatedAt: string;
}
```

The exact same shapes are enforced at the API boundary via Zod schemas in
`backend/src/schemas/index.js`.
