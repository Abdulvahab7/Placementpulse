import "dotenv/config";
import admin from "firebase-admin";

// Initialize Firebase using the exact same logic as your backend
const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

const seedData = async () => {
  console.log("🌱 Starting database seed...");

  const companies = [
    { id: "comp_google", name: "Google", domain: "Tech" },
    { id: "comp_microsoft", name: "Microsoft", domain: "Tech" },
  ];

  const roles = [
    { id: "role_frontend", companyId: "comp_google", title: "Frontend Engineer", level: "L3" },
    { id: "role_backend", companyId: "comp_microsoft", title: "Backend Engineer", level: "SDE 1" },
  ];

  const skills = [
    { id: "skill_react", name: "React.js", category: "frontend" },
    { id: "skill_node", name: "Node.js", category: "backend" },
    { id: "skill_algo", name: "Algorithms", category: "general" },
  ];

  const roleRequirements = [
    { roleId: "role_frontend", skillId: "skill_react", importance: "critical" },
    { roleId: "role_backend", skillId: "skill_node", importance: "critical" },
  ];

  try {
    for (const comp of companies) {
      await db.collection("companies").doc(comp.id).set(comp);
      console.log(`✅ Added Company: ${comp.name}`);
    }
    for (const role of roles) {
      await db.collection("roles").doc(role.id).set(role);
      console.log(`✅ Added Role: ${role.title}`);
    }
    for (const skill of skills) {
      await db.collection("skills").doc(skill.id).set(skill);
      console.log(`✅ Added Skill: ${skill.name}`);
    }
    for (const req of roleRequirements) {
      await db.collection("roleRequirements").add(req);
      console.log(`✅ Added Requirement: ${req.skillId} for ${req.roleId}`);
    }
    console.log("🎉 Seeding complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  }
};

seedData();
