// Builder, example 2 of 4: spend as one customer.
//
// Run: pnpm builder:02
// Needs: pnpm builder:01 first.
//
// What this shows:
//   A customer's key is locked to a customer's envelope. It can only see its
//   own envelope, and it cannot spend from anyone else's even if it asks to.
//   That is enforced on the server, so a bug in your code cannot cross it.
//
// Cost: about $0.03. It asks before spending.

import { clientForKey } from "../src/env.js";
import { confirmSpend, heading, step, nextCommand } from "../src/confirm.js";
import { explainAndExit, isCode } from "../src/explain.js";
import { requireTenants } from "./tenants.js";

const [acme, globex] = requireTenants();
if (!acme || !globex) process.exit(1);

const asAcme = clientForKey(acme.agentKey);

try {
  // -----------------------------------------------------------------------
  heading("Step 1. What this customer's key can see.");
  step(`Using the key for ${acme.label}.`);
  step("");

  const visible = await asAcme.listSubAccounts();
  step(`GET /v1/sub-accounts returned ${visible.length} envelope.`);
  for (const envelope of visible) {
    step(`  ${envelope.label}`);
  }
  step("");
  step("You have two customers. This key sees one. Read access is narrowed to");
  step("the envelope the key is locked to, not just write access.");

  // -----------------------------------------------------------------------
  const go = await confirmSpend(`spend as ${acme.label}`, "0.05");
  if (!go) process.exit(0);

  heading("Step 2. Spend as this customer.");

  const result = await asAcme.task("find the CEO of Stripe");
  step(`status:    ${result.status}`);
  step(`vendor:    ${result.slug ?? "none"}`);
  step(`charged:   $${result.charged?.amount ?? "0.00"}`);
  step("");
  step(`That charge is attributed to ${acme.label}, not to your account at large.`);

  // -----------------------------------------------------------------------
  heading("Step 3. Try to spend from the other customer's budget.");
  step(`Asking ${acme.label}'s key to charge ${globex.label}'s envelope.`);
  step("");

  try {
    await asAcme.task("find the CEO of Stripe", {}, globex.subAccountId);
    step("It worked. That is a bug, please tell us immediately.");
  } catch (error) {
    if (isCode(error, "KEY_SUB_ACCOUNT_MISMATCH")) {
      step("Refused: KEY_SUB_ACCOUNT_MISMATCH");
      step("");
      step("Note what did NOT happen. It was not quietly charged to the right");
      step("envelope instead. A caller that names an envelope and gets charged");
      step("elsewhere thinks it has a limit it does not have, so this is a hard");
      step("refusal. Nothing was charged.");
      step("");
      step("The simplest fix is to send no envelope at all. The key knows.");
    } else {
      throw error;
    }
  }

  nextCommand("pnpm builder:03", "Prove one customer running out does not affect the others.");
} catch (error) {
  explainAndExit(error);
}
