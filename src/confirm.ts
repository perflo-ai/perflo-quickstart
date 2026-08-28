// Nothing in this repo spends money without telling you first.
//
// Every example that can be charged calls confirmSpend(). It prints the worst
// case cost, then waits for you to type y. Two ways to skip the prompt:
//
//   --yes        run it, do not ask
//   --dry-run    do the free steps, then stop before spending
//
// DRY_RUN=1 in .env does the same as --dry-run.
//
// Note on --dry-run: it still needs a working key, because the free steps are
// real API calls. What it will not do is spend money.

import { createInterface } from "node:readline/promises";

const args = process.argv.slice(2);

export const isDryRun = args.includes("--dry-run") || process.env.DRY_RUN === "1";
const autoYes = args.includes("--yes") || args.includes("-y");

/**
 * Returns true if the example should go ahead and spend.
 *
 * In dry run it returns false, so the example stops here having done only the
 * free steps above it.
 */
export async function confirmSpend(description: string, worstCaseUsd: string): Promise<boolean> {
  console.log("");
  console.log(`  About to: ${description}`);
  console.log(`  Worst case cost: $${worstCaseUsd} of real money`);
  console.log("");

  if (isDryRun) {
    console.log("  DRY RUN. Stopping here. No money was spent.");
    console.log("  Everything above this line was free.");
    console.log("  Run again without --dry-run to do it for real.");
    console.log("");
    return false;
  }
  if (autoYes) {
    console.log("  Running with --yes.");
    console.log("");
    return true;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("  Type y to continue: ")).trim().toLowerCase();
  rl.close();
  console.log("");

  if (answer !== "y" && answer !== "yes") {
    console.log("  Stopped. Nothing was spent.");
    console.log("");
    return false;
  }
  return true;
}

export function heading(title: string): void {
  console.log("");
  console.log(`=== ${title} ===`);
  console.log("");
}

export function step(message: string): void {
  console.log(`  ${message}`);
}

export function nextCommand(command: string, why: string): void {
  console.log("");
  console.log(`  Next: ${command}`);
  console.log(`  ${why}`);
  console.log("");
}
