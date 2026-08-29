// Where the builder examples keep the keys they mint.
//
// A minted key is on the wire exactly once. If you do not store it, it is gone
// and you have to mint another. So example 01 writes what it minted to
// .tenants.json, and examples 02 to 04 read it back.
//
// .tenants.json is in .gitignore. In your own product these keys belong in
// whatever you already use for secrets, stored against the customer they
// belong to. A file is fine for a demo and wrong for production.

import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(root, ".tenants.json");

export interface Tenant {
  readonly label: string;
  readonly subAccountId: string;
  /** The key id, so example 05 can revoke it without guessing. */
  readonly keyId: string;
  readonly agentKey: string;
}

const WARNING =
  "LIVE SPENDING CREDENTIALS. Demo storage only, written by the Perflo " +
  "quickstart. If you are reading this outside that quickstart, revoke these " +
  "keys now with DELETE /v1/keys/{id}, or run pnpm builder:06.";

export function saveTenants(tenants: Tenant[]): void {
  // The warning rides inside the file because JSON has no comments, and this
  // file will outlive the terminal session that explained it.
  const body = tenants.map((tenant) => ({ _WARNING: WARNING, ...tenant }));
  writeFileSync(FILE, `${JSON.stringify(body, null, 2)}\n`, {
    encoding: "utf8",
    // Owner only. The default would be world readable on most machines.
    mode: 0o600,
  });
}

/** Remove the demo credential file. Used by example 05. */
export function clearTenants(): void {
  if (existsSync(FILE)) rmSync(FILE);
}

export function loadTenants(): Tenant[] {
  if (!existsSync(FILE)) return [];
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as Tenant[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function requireTenants(): Tenant[] {
  const tenants = loadTenants();
  if (tenants.length < 2) {
    console.error("");
    console.error("  No customers found yet.");
    console.error("");
    console.error("  Run this first:  pnpm builder:01");
    console.error("  It creates two customer budgets and stores their keys.");
    console.error("");
    process.exit(1);
  }
  return tenants;
}

export const TENANT_LABELS = ["quickstart-acme", "quickstart-globex"] as const;
