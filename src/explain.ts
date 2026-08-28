// Turns an API error code into plain English plus the fix.
//
// Branch on the code, never on the message. Codes are part of the contract and
// do not change. Messages are prose and may be reworded at any time.
//
// The full list is in docs/errors.md. These are the ones you will actually hit
// while working through this repo.

import { PerfloError } from "./perflo.js";

/**
 * Strip anything that looks like a key before printing.
 *
 * Error details and non-JSON response bodies can echo request content, and a
 * terminal gets screenshotted into support tickets. This is cheap insurance and
 * worth keeping if you copy this file.
 */
function redact(text: string): string {
  return text.replace(/perflo_(admin_)?(test|live)_[A-Za-z0-9_-]+/g, "perflo_$1$2_[REDACTED]");
}

const GUIDE: Record<string, { what: string; fix: string }> = {
  UNAUTHENTICATED: {
    what: "The key was missing, malformed, or has been revoked.",
    fix: "Check the key in .env. A revoked key stops working on the very next request, with no grace period.",
  },
  ACCOUNT_KEY_CANNOT_SPEND: {
    what: "You used an ACCOUNT key on a route that spends money.",
    fix: "Account keys provision and read. Use an AGENT key to pay, run a task, or transfer.",
  },
  ACCOUNT_KEY_REQUIRED: {
    what: "You used an AGENT key on a route that provisions or reads account-wide data.",
    fix: "Use your ACCOUNT key for envelopes, keys, balance, and statements.",
  },
  KEY_CANNOT_MINT: {
    what: "An agent key tried to create another key.",
    fix: "Use your account key, the dashboard, or the CLI. An agent key can never create keys.",
  },
  KEY_SUB_ACCOUNT_MISMATCH: {
    what: "The key is locked to one envelope and the request named a different one.",
    fix: "Leave subAccountId out. The key already knows which envelope it spends from. details.subAccount says which.",
  },
  GUARDRAIL_DENIED: {
    what: "A spending limit refused the call. Nothing was charged.",
    fix: "Read details.reason for the window that ran out, then raise the cap or wait for it to reset.",
  },
  INSUFFICIENT_BALANCE: {
    what: "The account itself has run out of spendable money.",
    fix: "Top up. details carries required, available, and owed. This stops every envelope at once, not just one.",
  },
  MAX_CHARGE_EXCEEDED: {
    what: "Your maxCharge ceiling was below what the vendor can charge.",
    fix: "Budget from maxChargePerCall in search results, not from price. The two differ for some vendors.",
  },
  VALIDATION_ERROR: {
    what: "The request was refused before any payment. This normally costs nothing.",
    fix: "details.requestSchema shows the vendor's required fields, split into body[] and query[]. One caveat: if the vendor's schemaConfidence is low, there was no shape to check and a wrong body can reach the vendor and cost money.",
  },
  SCHEMA_VALIDATION_FAILED: {
    what: "The vendor's own schema rejected your input, before any payment. Free.",
    fix: "details.requestSchema lists the fields it wanted. This is the code POST /v1/tasks returns for a body a vendor will not accept.",
  },
  RATE_LIMITED: {
    what: "Too many requests.",
    fix: "Back off and retry with exponential backoff, not a fixed delay. Discovery routes are limited per IP address, so all your traffic from one server shares a bucket.",
  },
  UNKNOWN_CAPABILITY: {
    what: "You named a capability or category that does not exist.",
    fix: "details.didYouMean lists near matches.",
  },
  VENDOR_NOT_PAYABLE: {
    what: "That vendor is switched off or blocked. Nothing was charged.",
    fix: "Search results carry payable: false and unpayableReason. Skip those before you call them.",
  },
  VENDOR_NOT_FOUND: {
    what: "No vendor has that slug.",
    fix: "details.didYouMean lists near matches. Slugs come from search results.",
  },
  SUB_ACCOUNT_NOT_FOUND: {
    what: "The envelope named does not exist, or belongs to another account.",
    fix: "List your envelopes first. This is never a 403, so you cannot tell existence apart from ownership, on purpose.",
  },
  CONFLICT: {
    what: "The write clashed with something that already exists.",
    fix: "details.reason says which. duplicate_label means that envelope name is taken. Labels are case insensitive.",
  },
  VENDOR_ERROR: {
    what: "We could not get a usable answer out of any candidate vendor.",
    fix: "Read details.netDebit before retrying. This is the one refusal that can still leave a real debit, because a step along the way may have paid.",
  },
  NETWORK_ERROR: {
    what: "The API could not be reached from this machine.",
    fix: "Check PERFLO_BASE_URL in .env and your network.",
  },
};

/** Print an error the way a human wants to read it, then stop. */
export function explainAndExit(error: unknown): never {
  console.error("");
  if (!(error instanceof PerfloError)) {
    console.error("  Something went wrong that was not an API error:");
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    console.error("");
    process.exit(1);
  }

  const guide = GUIDE[error.code];
  console.error(`  Failed: ${error.code} (HTTP ${error.status})`);
  console.error("");
  if (guide) {
    console.error(`  What happened: ${guide.what}`);
    console.error(`  What to do:    ${guide.fix}`);
  } else {
    console.error(`  Message: ${redact(error.message)}`);
    console.error("  See docs/errors.md for the codes this repo can produce.");
  }
  if (error.details && Object.keys(error.details).length > 0) {
    console.error("");
    console.error(`  details: ${redact(JSON.stringify(error.details))}`);
  }
  if (error.requestId) {
    console.error("");
    console.error(`  requestId: ${error.requestId}`);
    console.error("  Quote this if you contact support. It identifies the exact request.");
  }
  console.error("");
  process.exit(1);
}

/** True when the error is this specific code. Use it to expect a failure. */
export function isCode(error: unknown, code: string): error is PerfloError {
  return error instanceof PerfloError && error.code === code;
}
