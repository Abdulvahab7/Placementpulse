// Seeds 2-3 demo companies/roles/skills/roleRequirements for the Demand Engine
// and Company/Role Explorer. Clearly labeled historical/ai_inferred data —
// nothing here is fabricated as "verified" company information.
//
// Run with: node src/scripts/seed.js  (requires backend/.env configured)

import "dotenv/config";
import { db } from "../lib/firebaseAdmin.js";

const SKILLS = [
  { name: "Data Structures & Algorithms", category: "coding" },
  { name: "Java", category: "coding" },
  { name: "System Design", category: "coding" },
  { name: "SQL", category: "data" },
  { name: "Communication", category: "interview" },
];

const COMPANIES = [
  { name: "Northwind Analytics", sourceType: "manual" },
  { name: "Vertex Cloud Systems", sourceType: "manual" },
  { name: "Bluepeak Fintech", sourceType: "manual" },
];

async function upsertByName(collectionName, name, extraFields) {
  const snap = await db.collection(collectionName).get();
  const existing = snap.docs.find((d) => d.data().name === name);
  if (existing) return existing.id;
  const ref = await db.collection(collectionName).add({ name, ...extraFields, createdAt: new Date().toISOString() });
  return ref.id;
}

async function seed() {
  console.log("Seeding skills...");
  const skillIds = {};
  for (const s of SKILLS) {
    skillIds[s.name] = await upsertByName("skills", s.name, { category: s.category });
  }

  console.log("Seeding demo companies + roles...");
  const companyIds = {};
  for (const c of COMPANIES) {
    companyIds[c.name] = await upsertByName("companies", c.name, { sourceType: c.sourceType });
  }

  const rolesToSeed = [
    { companyName: "Northwind Analytics", title: "SDE-1 (Backend)" },
    { companyName: "Vertex Cloud Systems", title: "Software Engineer, Platform" },
    { companyName: "Bluepeak Fintech", title: "Associate Software Engineer" },
  ];

  const roleIds = {};
  for (const r of rolesToSeed) {
    const companyId = companyIds[r.companyName];
    const snap = await db.collection("roles").where("companyId", "==", companyId).where("title", "==", r.title).get();
    if (snap.docs.length > 0) {
      roleIds[`${r.companyName}:${r.title}`] = snap.docs[0].id;
      continue;
    }
    const ref = await db.collection("roles").add({ companyId, title: r.title, createdAt: new Date().toISOString() });
    roleIds[`${r.companyName}:${r.title}`] = ref.id;
  }

  // Clearly labeled historical/ai_inferred requirement data — NOT presented as
  // verified-from-company information (see PHASE_2_REPORT.md, Demand Engine section).
  const requirements = [
    // Northwind Analytics — SDE-1 (Backend): historical, from past placement cycles
    { roleKey: "Northwind Analytics:SDE-1 (Backend)", skill: "Data Structures & Algorithms", importanceLevel: "HIGH", sourceType: "historical" },
    { roleKey: "Northwind Analytics:SDE-1 (Backend)", skill: "Java", importanceLevel: "HIGH", sourceType: "historical" },
    { roleKey: "Northwind Analytics:SDE-1 (Backend)", skill: "SQL", importanceLevel: "MEDIUM", sourceType: "historical" },
    { roleKey: "Northwind Analytics:SDE-1 (Backend)", skill: "Communication", importanceLevel: "LOW", sourceType: "historical" },

    // Vertex Cloud Systems — student-contributed, unverified
    { roleKey: "Vertex Cloud Systems:Software Engineer, Platform", skill: "System Design", importanceLevel: "HIGH", sourceType: "student_contributed" },
    { roleKey: "Vertex Cloud Systems:Software Engineer, Platform", skill: "Data Structures & Algorithms", importanceLevel: "MEDIUM", sourceType: "student_contributed" },
    { roleKey: "Vertex Cloud Systems:Software Engineer, Platform", skill: "SQL", importanceLevel: "MEDIUM", sourceType: "student_contributed" },

    // Bluepeak Fintech — ai_inferred (would normally come from routes/jd.js;
    // seeded here directly for demo purposes with the same sourceType/labeling)
    { roleKey: "Bluepeak Fintech:Associate Software Engineer", skill: "Java", importanceLevel: "HIGH", sourceType: "ai_inferred" },
    { roleKey: "Bluepeak Fintech:Associate Software Engineer", skill: "Data Structures & Algorithms", importanceLevel: "MEDIUM", sourceType: "ai_inferred" },
    { roleKey: "Bluepeak Fintech:Associate Software Engineer", skill: "Communication", importanceLevel: "MEDIUM", sourceType: "ai_inferred" },
  ];

  const WEIGHT = { HIGH: 1.0, MEDIUM: 0.6, LOW: 0.3 };

  console.log("Seeding role requirements...");
  for (const r of requirements) {
    const roleId = roleIds[r.roleKey];
    const skillId = skillIds[r.skill];
    const existing = await db
      .collection("roleRequirements")
      .where("roleId", "==", roleId)
      .where("skillId", "==", skillId)
      .get();
    if (existing.docs.length > 0) continue;
    await db.collection("roleRequirements").add({
      roleId,
      skillId,
      importance: WEIGHT[r.importanceLevel],
      importanceLevel: r.importanceLevel,
      sourceType: r.sourceType,
      createdAt: new Date().toISOString(),
    });
  }

  console.log("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
