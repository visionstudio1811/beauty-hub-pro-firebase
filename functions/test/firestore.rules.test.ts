/**
 * Firestore Security Rules tests — the three highest-risk invariants.
 *
 * These run against the Firestore EMULATOR (they exercise firestore.rules, not
 * any Cloud Function code). They are intentionally NOT wired into the default
 * `npm test`, because that would fail on any machine / CI job without the
 * emulator running.
 *
 * HOW TO RUN (from the repo root):
 *
 *   firebase emulators:exec --only firestore \
 *     "npx vitest run --config functions/test/vitest.rules.config.ts"
 *
 * `emulators:exec` boots the Firestore emulator, sets FIRESTORE_EMULATOR_HOST,
 * runs the command, then tears the emulator down. See functions/test/README.md.
 *
 * If the emulator env var is absent, every test below is skipped (not failed)
 * so this file is safe to have on disk and safe to import anywhere.
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { setDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'beauty-hub-pro-app-rules-test';
const RULES_PATH = resolve(__dirname, '../../firestore.rules');

// Only run when a Firestore emulator is reachable. `emulators:exec` sets this.
const EMULATOR_UP = !!process.env.FIRESTORE_EMULATOR_HOST;
const describeWithEmulator = EMULATOR_UP ? describe : describe.skip;

const ORG_A = 'orgA';
const ORG_B = 'orgB';
const ADMIN_A = 'adminA';
const BEAUTICIAN_A = 'beauticianA';

let testEnv: RulesTestEnvironment;

/** Seed the baseline user + org docs the rules read via get() on every check. */
async function seedBaseline() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'organizations', ORG_A), { isActive: true, created_by: ADMIN_A });
    await setDoc(doc(db, 'organizations', ORG_B), { isActive: true, created_by: 'adminB' });

    // Admin + beautician belonging to org A.
    await setDoc(doc(db, 'users', ADMIN_A), {
      uid: ADMIN_A, role: 'admin', organizationId: ORG_A,
      email: 'admin@a.test', isActive: true, createdAt: new Date(),
    });
    await setDoc(doc(db, 'users', BEAUTICIAN_A), {
      uid: BEAUTICIAN_A, role: 'beautician', organizationId: ORG_A,
      email: 'bea@a.test', isActive: true, createdAt: new Date(),
    });

    // A client under EACH org, so we can prove cross-tenant reads fail.
    await setDoc(doc(db, 'organizations', ORG_A, 'clients', 'clientA1'), {
      name: 'Alice (org A)', deleted_at: null,
    });
    await setDoc(doc(db, 'organizations', ORG_B, 'clients', 'clientB1'), {
      name: 'Bob (org B)', deleted_at: null,
    });
  });
}

beforeAll(async () => {
  if (!EMULATOR_UP) return;
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, 'utf8') },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  if (!EMULATOR_UP) return;
  await testEnv.clearFirestore();
  await seedBaseline();
});

// ── (a) Tenant isolation ────────────────────────────────────────────────────
describeWithEmulator('tenant isolation', () => {
  it('a user of org A CAN read their own org’s client', async () => {
    const ctx = testEnv.authenticatedContext(BEAUTICIAN_A);
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'organizations', ORG_A, 'clients', 'clientA1')));
  });

  it('a user of org A CANNOT read org B’s client', async () => {
    const ctx = testEnv.authenticatedContext(BEAUTICIAN_A);
    // belongsToOrg(ORG_B) is false because users/beauticianA.organizationId === ORG_A.
    await assertFails(getDoc(doc(ctx.firestore(), 'organizations', ORG_B, 'clients', 'clientB1')));
  });

  it('an unauthenticated user CANNOT read any client', async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), 'organizations', ORG_A, 'clients', 'clientA1')));
  });
});

// ── (b) users/{uid} immutability ────────────────────────────────────────────
describeWithEmulator('users/{uid} field immutability', () => {
  it('a user CANNOT escalate their own role', async () => {
    const ctx = testEnv.authenticatedContext(BEAUTICIAN_A);
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'users', BEAUTICIAN_A), { role: 'admin' }),
    );
  });

  it('a user CANNOT flip their own isActive flag', async () => {
    // isActive is an admin-only field; a self-update that changes it is denied.
    const ctx = testEnv.authenticatedContext(BEAUTICIAN_A);
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'users', BEAUTICIAN_A), { isActive: false }),
    );
  });

  it('a user CAN update an allowed profile field (control case)', async () => {
    const ctx = testEnv.authenticatedContext(BEAUTICIAN_A);
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'users', BEAUTICIAN_A), { fullName: 'New Name' }),
    );
  });
});

// ── (c) waiverTokens signing path ───────────────────────────────────────────
describeWithEmulator('waiver signing requires a valid pending unexpired token', () => {
  const WAIVER_ID = 'waiver1';
  const VALID_TOKEN = 'valid-token';
  const EXPIRED_TOKEN = 'expired-token';

  async function seedWaiverFixtures() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30d
      const past = new Date(Date.now() - 60 * 1000); // -1m

      await setDoc(doc(db, 'waiverTokens', VALID_TOKEN), {
        waiverId: WAIVER_ID, organizationId: ORG_A, status: 'pending', expiresAt: future,
      });
      await setDoc(doc(db, 'waiverTokens', EXPIRED_TOKEN), {
        waiverId: WAIVER_ID, organizationId: ORG_A, status: 'pending', expiresAt: past,
      });

      // The pending clientWaivers doc the public form flips to 'signed'.
      await setDoc(doc(db, 'organizations', ORG_A, 'clientWaivers', WAIVER_ID), {
        status: 'pending', token: VALID_TOKEN, organizationId: ORG_A,
      });
    });
  }

  beforeEach(async () => {
    if (!EMULATOR_UP) return;
    await seedWaiverFixtures();
  });

  const signPayload = {
    status: 'signed',
    signer_name: 'Jane Doe',
    signer_email: 'jane@test.com',
    signer_phone: '+15555550123',
    answers: {},
    pdf_url: 'https://example.com/w.pdf',
    signed_at: new Date(),
  };

  it('an unauthenticated signer with a valid pending token CAN sign', async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'organizations', ORG_A, 'clientWaivers', WAIVER_ID), signPayload),
    );
  });

  it('signing FAILS when the waiver doc references an EXPIRED token', async () => {
    // Point the waiver at the expired token, then attempt to sign.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations', ORG_A, 'clientWaivers', WAIVER_ID), {
        status: 'pending', token: EXPIRED_TOKEN, organizationId: ORG_A,
      });
    });
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'organizations', ORG_A, 'clientWaivers', WAIVER_ID), signPayload),
    );
  });

  it('signing FAILS when the token’s organizationId does not match the path', async () => {
    // Same token id but pointing at ORG_B → enumeration attempt against ORG_A.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'waiverTokens', VALID_TOKEN), {
        waiverId: WAIVER_ID, organizationId: ORG_B, status: 'pending',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    });
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'organizations', ORG_A, 'clientWaivers', WAIVER_ID), signPayload),
    );
  });
});
