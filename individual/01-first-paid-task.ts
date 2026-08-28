// Individual, example 1 of 3: your first paid call.
//
// Run: pnpm individual:01
// Stop before spending: pnpm individual:01 --dry-run
//
// What this shows:
//   1. Searching for a vendor is free. You see real prices before you commit.
//   2. One call runs the whole job: pick a vendor, build the request, pay,
//      and fail over to another vendor if the first one fails.
//   3. The charge appears in your ledger straight away.
//
// Cost: about $0.03. It asks before spending.

import { agentClient } from "../src/env.js";
import { confirmSpend, heading, step, nextCommand } from "../src/confirm.js";
import { explainAndExit } from "../src/explain.js";

const perflo = agentClient();
const JOB = "find the CEO of Stripe";

try {
  // ---------------------------------------------------------------------
  // Step 1. Discovery is free. Nothing below this line costs money.
  // ---------------------------------------------------------------------
  heading("Step 1. Look at what is available. This is free.");

  const vendors = await perflo.search(JOB, 3);

  if (vendors.length === 0) {
    step("No vendor matched that job. Try a different description.");
    process.exit(0);
  }

  for (const vendor of vendors) {
    const flag = vendor.payable ? "payable" : `not payable (${vendor.unpayableReason ?? "unknown"})`;
    step(`${vendor.slug}`);
    step(`    price ${vendor.price.amount} ${vendor.price.currency} per ${vendor.pricingUnit}, ${flag}`);
  }

  const best = vendors.find((v) => v.payable);
  if (!best) {
    step("");
    step("Every match is switched off right now. Nothing was charged.");
    process.exit(0);
  }

  // Budget from maxChargePerCall, never from price. For most vendors they are
  // the same number. For a few they are very different, and the pay route
  // checks against maxChargePerCall.
  const worstCase = best.maxChargePerCall.amount;

  // ---------------------------------------------------------------------
  // Step 2. Spend.
  // ---------------------------------------------------------------------
  const go = await confirmSpend(`run the job "${JOB}"`, worstCase);
  if (!go) process.exit(0);

  heading("Step 2. Run the job.");
  step("Calling POST /v1/tasks. This picks the vendor, pays, and returns the answer.");

  const result = await perflo.task(JOB);

  step("");
  step(`status:  ${result.status}`);
  step(`vendor:  ${result.slug ?? "none"}`);
  step(`charged: ${result.charged ? `$${result.charged.amount}` : "$0.00"}`);
  step(`txn id:  ${result.transactionId ?? "none"}`);

  if (result.output !== undefined) {
    const preview = JSON.stringify(result.output).slice(0, 300);
    step("");
    step(`answer (first 300 characters): ${preview}`);
  }

  // ---------------------------------------------------------------------
  // Step 3. Prove it happened.
  // ---------------------------------------------------------------------
  heading("Step 3. Check what you have left, and the ledger.");
  step("An agent key cannot read the account balance, on purpose: under a real");
  step("integration the account total is the wrong answer to 'what can I spend'.");
  step("GET /v1/key is the replacement. It takes no input, because the key");
  step("already knows which envelope it spends from.");
  step("");

  const me = await perflo.self();
  step(`this key:  ${me.name ?? me.id}`);
  step(`its kind:  ${me.scope}`);
  step(`envelope:  ${me.subAccount.label}`);
  const windows = Object.entries(me.limits);
  if (windows.length === 0) {
    step("limits:    none set on this envelope");
  } else {
    for (const [window, usage] of windows) {
      if (usage) step(`limits:    ${window} $${usage.remaining.amount} left of $${usage.cap.amount}`);
    }
  }

  step("");
  const { rows, total } = await perflo.transactions({ limit: 3 });
  step(`your last 3 rows of ${total}:`);
  for (const row of rows) {
    // amount is signed. Negative is money leaving your account.
    step(`${row.createdAt}  ${row.kind.padEnd(10)} ${row.ledgerState.padEnd(8)} ${row.amount.amount}`);
  }
  step("");
  step("Only rows with ledgerState posted have moved your balance. Sum those and");
  step("nothing else, or you will overstate your spend.");

  nextCommand("pnpm individual:02", "Let Claude decide when to spend, instead of hardcoding the job.");
} catch (error) {
  explainAndExit(error);
}
