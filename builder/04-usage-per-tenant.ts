// Builder, example 4 of 6: what did each customer cost you.
//
// Run: pnpm builder:04
//
// What this shows:
//   One call gives you a per customer breakdown for a month. This is the
//   answer to "can I bill my customers for this", and it is a single GET.
//
// Cost: nothing. Reading is free.

import { accountClient } from "../src/env.js";
import { heading, step } from "../src/confirm.js";
import { explainAndExit } from "../src/explain.js";
import { loadTenants } from "./tenants.js";

const perflo = accountClient();

function money(value: { amount: string }): string {
  return `$${Number(value.amount).toFixed(4)}`;
}

try {
  // -----------------------------------------------------------------------
  heading("Step 1. This month, broken down by customer.");
  step("GET /v1/statement. One object, no pagination.");
  step("");

  const statement = await perflo.statement();

  step(`period:  ${statement.period}`);
  step(`closed:  ${statement.closed ?? "not yet, the month is still open"}`);
  step("");
  step(`opening balance: ${money(statement.openingBalance)}`);
  step(`closing balance: ${money(statement.closingBalance)}`);
  step(`total charged:   ${money(statement.totalCharged)}`);
  step(`owed at close:   ${money(statement.owedAtClose)}`);
  step("");
  step(statement.summary);

  // -----------------------------------------------------------------------
  heading("Step 2. Per customer. This is your billing input.");

  if (statement.bySubAccount.length === 0) {
    step("Nothing charged yet this month. Run pnpm builder:02 first.");
  } else {
    step("customer                     calls    charged");
    step("-----------------------------------------------");
    for (const line of statement.bySubAccount) {
      const name = (line.subAccount ?? "unattributed").padEnd(28);
      const calls = String(line.calls).padStart(5);
      step(`${name} ${calls}    ${money(line.charged)}`);
    }
  }

  step("");
  step("A charge with no customer attached shows as unattributed rather than");
  step("being dropped, so this list always adds up to total charged.");

  // -----------------------------------------------------------------------
  heading("Step 3. Per capability, in case you price by feature.");

  if (statement.byCapability.length === 0) {
    step("Nothing charged yet this month.");
  } else {
    for (const line of statement.byCapability) {
      step(`${(line.capability ?? "unattributed").padEnd(28)} ${String(line.calls).padStart(5)}    ${money(line.charged)}`);
    }
  }

  // -----------------------------------------------------------------------
  heading("Step 4. Line items for one customer.");

  const tenants = loadTenants();
  const first = tenants[0];
  if (!first) {
    step("No stored customers. Run pnpm builder:01 to create some.");
  } else {
    step(`GET /v1/transactions?subAccount=${first.label}`);
    step("");
    const { rows, total } = await perflo.transactions({ subAccount: first.label, limit: 10 });
    step(`${total} rows for this customer. Showing up to 10.`);
    step("");
    if (rows.length === 0) {
      step("No rows yet for this customer.");
    } else {
      for (const row of rows) {
        step(`${row.createdAt}  ${row.ledgerState.padEnd(8)} ${String(row.amount.amount).padStart(10)}  ${row.slug ?? ""}`);
      }
      step("");
      step("amount is signed. Negative is money leaving. Sum only the rows where");
      step("ledgerState is posted. Summing everything overstates your spend,");
      step("because pending has not landed and voided moved nothing.");
    }
  }

  // -----------------------------------------------------------------------
  heading("Step 5. Three things to know before you bill on this.");
  step("1. Periods are whole months, as YYYY-MM. If you bill customers on their");
  step("   own signup anniversary, build that from GET /v1/transactions instead,");
  step("   which takes from and to dates.");
  step("");
  step("2. Your markup is your code. This tells you what you were charged. What");
  step("   you charge your customer is your decision and lives in your billing.");
  step("");
  step("3. An open month is not final. closed is null until the month ends, and");
  step("   more charges can still land in it. Do not invoice from an open month.");
  step("");
  step("Also useful: ask for a past month and you get the same numbers every");
  step("time, because it is rebuilt from the ledger rather than from today's");
  step("balances. Try: period 2026-07");

  console.log("");
  console.log("  That is the builder track. You now have per customer budgets,");
  console.log("  enforced isolation, and per customer billing data.");
  console.log("");
  console.log("  Next: pnpm builder:05");
  console.log("  Optional. Opens a local page that shows charges as they land.");
  console.log("");
  console.log("  Then: pnpm builder:06");
  console.log("  Revokes the two demo keys and deletes .tenants.json. Do this");
  console.log("  before you put the repo down, because those keys are live and");
  console.log("  stored in plaintext.");
  console.log("");
} catch (error) {
  explainAndExit(error);
}
