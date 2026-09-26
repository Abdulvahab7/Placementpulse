/**
 * Firestore Security Rules tests.
 *
 * These run against the Firebase Firestore emulator, NOT the fake in-memory store
 * used by the other tests. They are skipped automatically unless the emulator is
 * reachable, so `npm test` still passes in plain CI without the emulator installed.
 *
 * To actually run them:
 *   1. `firebase emulators:start --only firestore` (from the repo root)
 *   2. `npm test` in backend/ (with FIRESTORE_EMULATOR_HOST=localhost:8081 set)
 */
import { jest } from "@jest/globals";

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const describeIfEmulator = EMULATOR_HOST ? describe : describe.skip;

describeIfEmulator("Firestore security rules", () => {
  let testEnv;

  beforeAll(async () => {
    const { initializeTestEnvironment } = await import("@firebase/rules-unit-testing");
    const fs = await import("fs");
    testEnv = await initializeTestEnvironment({
      projectId: "placement-pulse-test",
      firestore: {
        rules: fs.readFileSync("../firestore.rules", "utf8"),
        host: EMULATOR_HOST.split(":")[0],
        port: Number(EMULATOR_HOST.split(":")[1]),
      },
    });
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  it("lets a student read their own user document", async () => {
    const alice = testEnv.authenticatedContext("alice");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("users").doc("alice").set({ name: "Alice" });
    });
    const { assertSucceeds } = await import("@firebase/rules-unit-testing");
    await assertSucceeds(alice.firestore().collection("users").doc("alice").get());
  });

  it("blocks a student from reading another student's user document", async () => {
    const bob = testEnv.authenticatedContext("bob");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("users").doc("alice").set({ name: "Alice" });
    });
    const { assertFails } = await import("@firebase/rules-unit-testing");
    await assertFails(bob.firestore().collection("users").doc("alice").get());
  });

  it("blocks an unauthenticated read of a private studentSkills doc", async () => {
    const anon = testEnv.unauthenticatedContext();
    const { assertFails } = await import("@firebase/rules-unit-testing");
    await assertFails(anon.firestore().collection("studentSkills").doc("s1").get());
  });
});
