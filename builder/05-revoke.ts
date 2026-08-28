// Builder, example 5 of 5: clean up after yourself.
//
// Run: pnpm builder:05
//
// What this shows:
//   Revoking a key, and why the order matters when you rotate one for real.
//
//   Example 01 minted two live spending keys and wrote them to .tenants.json in
//   plaintext. This revokes them and deletes the file. Run it before you put
//   this repo down.
//
// Cost: nothing. Revoking is free.

import { accountClient } from "../src/env.js";
import { heading, step } from "../src/confirm.js";
import { explainAndExit } from "../src/explain.js";
import { loadTenants, clearTenants } from "./tenants.js";

const perflo = accountClient();

try {
  const tenants = loadTenants();

  heading("Step 1. What is on disk.");
  if (tenants.length === 0) {
    step("No stored keys. Nothing to clean up.");
    process.exit(0);
  }
  for (const tenant of tenants) {
    step(`${tenant.label}  key ${tenant.keyId}`);
  }

  heading("Step 2. Revoke each one.");
  step("A revoked key stops working on its very next request. There is no grace");
  step("period, so for a real rotation the order is:");
  step("");
  step("  1. mint the new key");
  step("  2. deploy it");
  step("  3. verify the agent is using it");
  step("  4. only then revoke the old one");
  step("");
  step("Doing it the other way round is an outage.");
  step("");

  for (const tenant of tenants) {
    try {
      await perflo.revokeKey(tenant.keyId);
      step(`revoked: ${tenant.label}`);
    } catch (error) {
      // Already gone is a fine outcome for a cleanup script.
      step(`${tenant.label}: could not revoke (${(error as { code?: string }).code ?? "unknown"})`);
    }
  }

  heading("Step 3. Delete the plaintext file.");
  clearTenants();
  step(".tenants.json deleted.");
  step("");
  step("The envelopes are left in place. They hold no credentials, and they");
  step("carry the spend history you may still want in your statement. To switch");
  step("one off: DELETE /v1/sub-accounts/{id}");
  step("");
  step("Faster brake, worth knowing before you need it: to stop every key on an");
  step("envelope at once, set its caps to zero with PATCH /v1/sub-accounts/{id}");
  step('and {"limits":{"hourly":{"amount":"0.00","currency":"USD"}}}. That takes');
  step("one call and does not require you to enumerate the keys first.");
  console.log("");
} catch (error) {
  explainAndExit(error);
}
