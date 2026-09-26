import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import usersRouter from "./routes/users.js";
import readinessRouter from "./routes/readiness.js";
import { makeOwnedCollectionRouter } from "./routes/makeOwnedCollectionRouter.js";
import { makePublicCollectionRouter } from "./routes/makePublicCollectionRouter.js";
import jdRouter from "./routes/jd.js";
import gapEngineRouter from "./routes/gapEngine.js";
import failureAutopsyRouter from "./routes/failureAutopsy.js";
import preparationPlansRouter from "./routes/preparationPlans.js";
import correctionDrillsRouter from "./routes/correctionDrills.js";

import {
  skillSchema,
  studentSkillUpdateSchema,
  companySchema,
  roleSchema,
  roleRequirementSchema,
  attemptSchema,
  failurePatternSchema,
  interventionSchema,
} from "./schemas/index.js";

import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" }));
  app.use(express.json({ limit: "1mb" }));
  if (process.env.NODE_ENV !== "test") {
    app.use(morgan("dev"));
  }

  app.get("/api/health", (req, res) => {
    res.json({ success: true, data: { status: "ok", service: "placement-pulse-backend" } });
  });

  // User-owned resources
  app.use("/api/users", usersRouter);
  app.use("/api/student-skills", makeOwnedCollectionRouter("studentSkills", studentSkillUpdateSchema));
  app.use("/api/attempts", makeOwnedCollectionRouter("attempts", attemptSchema));
  app.use("/api/failure-patterns", makeOwnedCollectionRouter("failurePatterns", failurePatternSchema));
  app.use("/api/interventions", makeOwnedCollectionRouter("interventions", interventionSchema));
  app.use("/api/readiness", readinessRouter);

  // Shared reference resources
  app.use("/api/skills", makePublicCollectionRouter("skills", skillSchema, { filterableFields: ["category"] }));
  app.use("/api/companies", makePublicCollectionRouter("companies", companySchema));
  app.use("/api/roles", makePublicCollectionRouter("roles", roleSchema, { filterableFields: ["companyId"] }));
  app.use(
    "/api/role-requirements",
    makePublicCollectionRouter("roleRequirements", roleRequirementSchema, {
      filterableFields: ["roleId", "skillId"],
    })
  );

  // ---- Phase 2: Demand Engine, Gap Engine, Failure Autopsy ----
  app.use("/api/jd", jdRouter);
  app.use("/api/gap-engine", gapEngineRouter);
  app.use("/api/failure-autopsy", failureAutopsyRouter);

  // ---- Phase 3: Adaptive Preparation Engine ----
  app.use("/api/preparation-plans", preparationPlansRouter);

  // ---- Final phase: Correction Drill + Reassessment ----
  app.use("/api/correction-drills", correctionDrillsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
