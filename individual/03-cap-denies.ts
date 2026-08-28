// Individual, example 3 of 3: watch a spend get refused.
//
// Run: pnpm individual:03
//
// What this shows:
//   A refusal costs nothing. The limit is checked before any payment is built,
//   so a denied call is not a charge you have to reverse. This is the property
//   that makes it safe to hand a budget to an agent.
//
// Cost: expected to be nothing, and it asks before the one call that could
// change that. The refusal below is checked against the catalog price before
// any payment is built, so it normally costs zero. It is not a guarantee: a
// vendor that has to fetch a live quote can settle that quote first, and a
// vendor with no confident request schema can have a wrong body reach it. So
// this example confirms with you rather than promising.

import { agentClient } from "../src/env.js";
import { confirmSpend, heading, step, nextCommand } from "../src/confirm.js";
import { explainAndExit, isCode } from "../src/explain.js";

const perflo = agentClient();

try {
  // ---------------------------------------------------------------------
  // Step 1. What are this key's limits right now.
  // ---------------------------------------------------------------------
  heading("Step 1. Read this key's own envelope.");
  step("An agent key is locked to exactly one envelope. It sees only that one.");
  step("");

  const envelopes = await perflo.listSubAccounts();
  const mine = envelopes[0];

  if (!mine) {
    step("This key has no envelope, which should not happen. Contact support.");
    process.exit(1);
  }

  step(`envelope: ${mine.label}`);
  const windows = Object.entries(mine.limits);
  if (windows.length === 0) {
    step("limits:   none set, so only the account balance bounds this key");
  } else {
    for (const [window, usage] of windows) {
      if (!usage) continue;
      step(`limits:   ${window} cap $${usage.cap.amount}, spent $${usage.spent.amount}, left $${usage.remaining.amount}`);
    }
  }

  // ---------------------------------------------------------------------
  // Step 2. Trigger a refusal on purpose.
  // ---------------------------------------------------------------------
  heading("Step 2. Ask for a ceiling the vendor cannot honour.");
  step("maxCharge is a per-call ceiling. Set it below what the vendor can charge");
  step("and the call is refused before anything is paid.");
  step("");

  const vendors = await perflo.search("search the web for recent news", 3);
  const target = vendors.find((v) => v.payable);

  if (!target) {
    step("No payable vendor is available right now, so there is nothing to refuse.");
    process.exit(0);
  }

  // A ceiling strictly BELOW the vendor's price, so the refusal is certain.
  //
  // Rounding matters here. Halving and then rounding to 4 decimals can round
  // back UP to the full price on a sub-cent vendor, and then this "free"
  // example pays. So floor it, and bail out rather than risk a charge.
  const priceMinor = Math.round(Number(target.maxChargePerCall.amount) * 10000);
  if (priceMinor <= 1) {
    step(`${target.slug} costs $${target.maxChargePerCall.amount}, which is too`);
    step("small to set a ceiling underneath. Skipping rather than risk a charge.");
    step("");
    step("Nothing was spent. Re-run later when a pricier vendor is available.");
    process.exit(0);
  }
  const ceiling = (Math.floor(priceMinor / 2) / 10000).toFixed(4);

  // Belt and braces: never send a ceiling that is not strictly lower.
  if (Number(ceiling) >= Number(target.maxChargePerCall.amount)) {
    step("Could not build a ceiling below the price. Skipping to stay free.");
    process.exit(0);
  }

  step(`vendor:            ${target.slug}`);
  step(`it can charge:     $${target.maxChargePerCall.amount}`);
  step(`we will allow:     $${ceiling}`);

  // The expected outcome is a free refusal. The worst case is one full price,
  // so that is the number we show you.
  const go = await confirmSpend(
    "ask for a ceiling below the price, expecting a free refusal",
    target.maxChargePerCall.amount,
  );
  if (!go) process.exit(0);

  try {
    await perflo.pay(
      target.slug,
      {
        input: { query: "agentic payments" },
        maxCharge: { amount: ceiling, currency: "USD" },
      },
      // An idempotency key is what stops a dropped connection from paying
      // twice. It must be STABLE for one logical payment. Generating a fresh
      // uuid on every retry is the common mistake and defeats the point, so
      // derive it from the thing you are buying.
      `quickstart-cap-demo-${target.slug}`,
    );
    step("It went through. That was not expected. Prices may have changed.");
  } catch (error) {
    if (isCode(error, "MAX_CHARGE_EXCEEDED")) {
      step("Refused: MAX_CHARGE_EXCEEDED");
      step("");
      step("Nothing was charged. Read that again, because it is the important part.");
      step("The ceiling was compared to the price before any payment was built.");
    } else if (isCode(error, "VALIDATION_ERROR")) {
      step("Refused: VALIDATION_ERROR");
      step("");
      step("Also free. The vendor needs different fields than we guessed, and the");
      step("request was rejected before payment. details.requestSchema lists them.");
    } else {
      throw error;
    }
  }

  // ---------------------------------------------------------------------
  // Step 3. The three refusals worth knowing.
  // ---------------------------------------------------------------------
  heading("Step 3. The three refusals you will meet.");
  step("MAX_CHARGE_EXCEEDED   your per-call ceiling was too low.        Free.");
  step("GUARDRAIL_DENIED      an hourly, daily or monthly cap ran out.  Free.");
  step("INSUFFICIENT_BALANCE  the whole account is out of money.        Free.");
  step("");
  step("All three happen before payment. None of them costs you anything.");
  step("");
  step("The difference that matters:");
  step("  GUARDRAIL_DENIED stops ONE envelope. Others keep working.");
  step("  INSUFFICIENT_BALANCE stops EVERY envelope at once.");
  step("");
  step("An agent key cannot change its own caps. That is deliberate: nothing");
  step("that spends is allowed to widen its own budget. Caps are set in the");
  step("dashboard, or with an account key.");

  nextCommand(
    "pnpm builder:01",
    "See how to give each of your own customers a separate budget.",
  );
} catch (error) {
  explainAndExit(error);
}
