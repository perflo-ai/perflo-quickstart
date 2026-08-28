// Builder, example 1 of 4: give each customer their own budget.
//
// Run: pnpm builder:01
//
// What this shows:
//   Two things exist per customer. An ENVELOPE holds the limits. An AGENT KEY
//   is locked to that envelope and does the spending. You hand the key to the
//   customer's agent and it physically cannot spend outside its envelope.
//
//   Your server holds one ACCOUNT KEY and nothing else. That key creates all of
//   this and cannot pay a vendor itself. It is still a root credential, because
//   it can raise limits and mint keys.
//
// Cost: nothing in the normal case. Step 1 makes one spend attempt that the
// server refuses, to prove the account key cannot pay. If that refusal ever
// stopped working, that call would cost one vendor price, and the example says
// so loudly.
// Safe to run twice: it reuses what already exists.

import { accountClient } from "../src/env.js";
import { heading, step, nextCommand } from "../src/confirm.js";
import { explainAndExit, isCode } from "../src/explain.js";
import { usd } from "../src/perflo.js";
import { saveTenants, loadTenants, TENANT_LABELS, type Tenant } from "./tenants.js";

const perflo = accountClient();

// Two made up customers. In your product these are your real customer ids.
const PLAN = [
  { label: TENANT_LABELS[0], hourly: "0.50", daily: "2.00", monthly: "10.00" },
  { label: TENANT_LABELS[1], hourly: "1.00", daily: "5.00", monthly: "20.00" },
];

try {
  heading("Step 1. Confirm this key cannot spend.");
  step("An account key provisions and reads. It never pays. Proving that:");
  step("");

  // We do not need the result. We only want to show you the refusal.
  try {
    await perflo.task("this should never run");
    step("It spent something. That is a bug, please tell us.");
  } catch (error) {
    if (isCode(error, "ACCOUNT_KEY_CANNOT_SPEND")) {
      step("Refused: ACCOUNT_KEY_CANNOT_SPEND");
      step("");
      step("Good. This key cannot pay a vendor.");
      step("");
      step("It can still raise any limit and mint a spending key, so keep it in");
      step("your secret store. It is a root credential, not a safe one.");
    } else if (isCode(error, "UNAUTHENTICATED")) {
      throw error;
    } else {
      step(`Refused: ${error instanceof Error ? (error as { code?: string }).code ?? "unknown" : "unknown"}`);
    }
  }

  // -----------------------------------------------------------------------
  heading("Step 2. Create one envelope per customer.");
  step("Cap rules worth knowing before you copy this:");
  step("  An hourly cap is required whenever you set any other cap.");
  step("  Caps must not shrink as the window grows: hourly <= daily <= monthly <= total.");
  step("  Leave a window out and there is no limit at that window.");
  step("");

  const existing = await perflo.listSubAccounts();
  const known = loadTenants();
  const tenants: Tenant[] = [];

  for (const wanted of PLAN) {
    let envelopeId: string;
    const already = existing.find((e) => e.label.toLowerCase() === wanted.label.toLowerCase());

    if (already) {
      envelopeId = already.id;
      step(`${wanted.label}: envelope already exists, reusing it`);
    } else {
      const created = await perflo.createSubAccount(wanted.label, {
        hourly: usd(wanted.hourly),
        daily: usd(wanted.daily),
        monthly: usd(wanted.monthly),
      });
      envelopeId = created.id;
      step(`${wanted.label}: created with $${wanted.hourly} per hour, $${wanted.daily} per day`);
    }

    // -------------------------------------------------------------------
    // Mint the key that this customer's agent will hold, unless we already
    // stored one. A key is returned once and never again.
    // -------------------------------------------------------------------
    const stored = known.find((t) => t.label === wanted.label);
    if (stored) {
      step(`${wanted.label}: reusing the key already in .tenants.json`);
      tenants.push({ ...stored, subAccountId: envelopeId });
      continue;
    }

    const minted = await perflo.mintKey(`${wanted.label}-agent`, envelopeId);
    step(`${wanted.label}: minted key ending ${minted.lastFour}`);
    tenants.push({
      label: wanted.label,
      subAccountId: envelopeId,
      keyId: minted.id,
      agentKey: minted.key,
    });
  }

  saveTenants(tenants);

  // -----------------------------------------------------------------------
  heading("Step 3. What you now have.");
  step("Stored in .tenants.json, which is gitignored:");
  step("");
  for (const tenant of tenants) {
    step(`${tenant.label}  key ...${tenant.agentKey.slice(-4)}`);
  }
  step("");
  step("Those keys are LIVE and they are stored in plaintext in .tenants.json.");
  step("That file is demo storage, not a design to copy. In your product each");
  step("key goes into whatever you already use for secrets, encrypted, stored");
  step("against the customer it belongs to. Never log a key. Never send one to");
  step("a browser.");
  step("");
  step("When you are done with this track, run pnpm builder:05 to revoke both");
  step("keys and delete the file.");

  nextCommand("pnpm builder:02", "Spend as one of these customers.");
} catch (error) {
  explainAndExit(error);
}
