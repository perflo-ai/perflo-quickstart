// The front door. Run: pnpm start
//
// It works out where you are, asks which track you want, checks you have the
// right key, and runs the first example for you.
//
// You never have to use this. Every example is a standalone file you can run
// directly. This just saves you reading the README first.

import { existsSync, copyFileSync, chmodSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

console.log("");
console.log("  Perflo quickstart");
console.log("  Give an AI agent a budget it cannot exceed.");
console.log("");

// 1. Make sure there is a .env to read.
const envPath = join(root, ".env");
if (!existsSync(envPath)) {
  console.log("  You have no .env file yet. Creating one from .env.example.");
  copyFileSync(join(root, ".env.example"), envPath);
  // Your keys go in this file. Do not leave it world readable.
  chmodSync(envPath, 0o600);
  console.log("  Done. Open .env and add one key, then run pnpm start again.");
  console.log("");
  console.log("  Which key you need depends on the track you pick below, so");
  console.log("  read this first:");
  console.log("");
  console.log("    Individual: you want your own agent to spend your own money.");
  console.log("                You need PERFLO_AGENT_KEY.");
  console.log("");
  console.log("    Builder:    you are running this for your own customers, and");
  console.log("                each customer needs a separate budget.");
  console.log("                You need PERFLO_ACCOUNT_KEY.");
  console.log("");
  console.log("  Both keys come from the same place: sign in to your Perflo");
  console.log("  dashboard, open the developer or builder section, and create");
  console.log("  one. The key is shown once, so copy it straight away.");
  console.log("");
  console.log("  Prefixes, so you can tell them apart:");
  console.log("    agent key    perflo_live_...       or perflo_test_...");
  console.log("    account key  perflo_admin_live_... or perflo_admin_test_...");
  console.log("");
  process.exit(0);
}

// 2. Which track.
console.log("  Which describes you?");
console.log("");
console.log("    1  I want my own agent to spend my own money.");
console.log("    2  I am building for my customers, and each needs its own budget.");
console.log("");
const choice = await ask("  Type 1 or 2: ");
console.log("");

if (choice === "1") {
  console.log("  Individual track. Running the first example.");
  console.log("  It spends about $0.03 and will ask before it does.");
  console.log("");
  await import("../individual/01-first-paid-task.js");
} else if (choice === "2") {
  console.log("  Builder track. Running the first example.");
  console.log("  It creates two customer budgets and spends nothing yet.");
  console.log("");
  await import("../builder/01-provision-tenant.js");
} else {
  console.log(`  "${choice}" is not 1 or 2. Nothing was run.`);
  console.log("  Try again with: pnpm start");
  console.log("");
}
