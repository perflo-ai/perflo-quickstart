// Builder, example 3 of 5: one customer runs out, the others do not notice.
//
// Run: pnpm builder:03
// Needs: pnpm builder:01 first.
//
// What this shows:
//   This is the question every buyer asks. If one customer burns their budget,
//   does my whole integration stop? No. A customer hitting their own cap gets
//   403 GUARDRAIL_DENIED and every other customer keeps working.
//
//   There is one exception and you should know it: if the ACCOUNT runs out of
//   money, everyone stops at once with 402 INSUFFICIENT_BALANCE. Envelope caps
//   isolate customers from each other. They do not isolate them from an empty
//   account.
//
// How it stays repeatable: we spend once, read what we were ACTUALLY charged,
// then set the cap just above that. The next identical call then has no room
// left, so the refusal is certain rather than a coin flip on vendor pricing.
//
// Cost: two or three paid calls, a few cents. It asks before spending.
//
// It also changes one envelope's caps and puts them back. It reads the existing
// caps first and restores exactly those, in a finally block, so a vendor error
// halfway through cannot leave your customer uncapped.

import { accountClient, clientForKey } from "../src/env.js";
import { confirmSpend, heading, step, nextCommand } from "../src/confirm.js";
import { explainAndExit, isCode } from "../src/explain.js";
import { usd, type CapWindows, type SubAccount } from "../src/perflo.js";
import { requireTenants } from "./tenants.js";

const [acme, globex] = requireTenants();
if (!acme || !globex) process.exit(1);

const admin = accountClient();
const asAcme = clientForKey(acme.agentKey);
const asGlobex = clientForKey(globex.agentKey);

/** Turn an envelope's current usage back into a caps object we can restore. */
function capsOf(envelope: SubAccount): CapWindows {
  const caps: Record<string, { amount: string; currency: string }> = {};
  for (const [window, usage] of Object.entries(envelope.limits)) {
    if (usage) caps[window] = usage.cap;
  }
  return caps as CapWindows;
}

let originalCaps: CapWindows | null = null;

try {
  // ---------------------------------------------------------------------
  heading("Step 1. Record this customer's current caps, so we can put them back.");
  step("We read them first. The restore at the end uses these exact values, not");
  step("hardcoded ones, so this example cannot overwrite your real limits.");
  step("");

  const before = (await admin.listSubAccounts()).find((e) => e.id === acme.subAccountId);
  if (!before) {
    step(`Envelope for ${acme.label} not found. Re-run pnpm builder:01.`);
    process.exit(1);
  }
  originalCaps = capsOf(before);

  const shown = Object.entries(originalCaps);
  if (shown.length === 0) {
    step("This envelope has no caps set at all.");
  } else {
    for (const [window, cap] of shown) step(`${window}: $${cap.amount}`);
  }

  const go = await confirmSpend(
    `spend as ${acme.label}, cap it at what it just spent, then prove ${globex.label} is unaffected`,
    "0.20",
  );
  if (!go) process.exit(0);

  // ---------------------------------------------------------------------
  heading("Step 2. One paid call from the first customer.");

  const first = await asAcme.task("find the CEO of Stripe");
  const charged = Number(first.charged?.amount ?? "0");
  step(`charged: $${charged.toFixed(4)}  status: ${first.status}`);

  if (charged <= 0) {
    step("");
    step("That call charged nothing, so there is no spend to cap against.");
    step("Nothing more to demonstrate. Caps will be restored on the way out.");
    process.exit(0);
  }

  // ---------------------------------------------------------------------
  heading("Step 3. Set the hourly cap just above what was already spent.");
  step("Only an account key can do this. A spending key cannot widen or narrow");
  step("its own budget, which is exactly why handing one out is safe.");
  step("");
  step("Careful when you copy this: limits is REPLACED, not merged. A window you");
  step("leave out is cleared. We send only hourly here, so every other window is");
  step("cleared for the moment, and restored in the finally block below.");
  step("");

  // Room for what is already spent and almost nothing more.
  const tightCap = (charged * 1.05).toFixed(4);
  await admin.patchSubAccount(acme.subAccountId, { hourly: usd(tightCap) });
  step(`${acme.label} hourly cap is now $${tightCap}, and $${charged.toFixed(4)} of it is gone.`);

  // ---------------------------------------------------------------------
  heading("Step 4. The same call again, from the same customer.");
  step("There is no room left in the hourly window.");
  step("");

  let denied = false;
  try {
    const second = await asAcme.task("find the CEO of Stripe");
    step(`It went through and charged $${second.charged?.amount ?? "0.00"}.`);
    step("Unexpected. The vendor may have priced this call lower than the first.");
  } catch (error) {
    if (isCode(error, "GUARDRAIL_DENIED")) {
      denied = true;
      const reason = (error.details?.reason as string | undefined) ?? "a cap was exceeded";
      step("Refused: GUARDRAIL_DENIED");
      step(`reason:  ${reason}`);
      step("");
      step("Nothing was charged. The cap was checked before any payment was built.");
    } else {
      throw error;
    }
  }

  // ---------------------------------------------------------------------
  heading("Step 5. The other customer, at the same moment.");
  step(`${globex.label} has its own envelope and its own cap. It is untouched.`);
  step("");

  const other = await asGlobex.task("find the CEO of Stripe");
  step(`charged: $${other.charged?.amount ?? "0.00"}  status: ${other.status}`);
  step("");

  if (denied) {
    step("That is the proof. One customer was refused. The other was not affected");
    step("in any way, at the same instant, on the same account.");
  } else {
    step("The first customer was not refused this time, so isolation was not");
    step("exercised. Run it again within the same hour and it will be.");
  }

  nextCommand("pnpm builder:04", "See what each customer cost you this month.");
} catch (error) {
  explainAndExit(error);
} finally {
  // Runs even if a vendor error threw above. Without this, a mid-example
  // failure would leave a real customer with the demo's caps.
  if (originalCaps) {
    try {
      await admin.patchSubAccount(acme.subAccountId, originalCaps);
      console.log(`  Caps restored on ${acme.label}.`);
      console.log("");
    } catch {
      console.error("");
      console.error(`  COULD NOT RESTORE CAPS on ${acme.label}.`);
      console.error("  Set them yourself before using that envelope again:");
      console.error(`  ${JSON.stringify(originalCaps)}`);
      console.error("");
    }
  }
}
