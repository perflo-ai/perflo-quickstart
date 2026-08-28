// Reads .env and fails with a message that tells you exactly what to do next.
//
// Every example calls one of these. If a value is missing you get a short
// instruction, not a stack trace.

import "dotenv/config";
import { Perflo } from "./perflo.js";

/**
 * The two key kinds have different prefixes, and that is useful: it means we
 * can catch a key pasted into the wrong slot here, before any network call.
 *
 *   agent key    perflo_live_...        or perflo_test_...
 *   account key  perflo_admin_live_...  or perflo_admin_test_...
 *
 * `live` on production, `test` everywhere else. It is the environment that
 * decides, not you.
 */
const PREFIXES = {
  PERFLO_AGENT_KEY: ["perflo_live_", "perflo_test_"],
  PERFLO_ACCOUNT_KEY: ["perflo_admin_live_", "perflo_admin_test_"],
} as const;

function baseUrl(): string {
  const value = process.env.PERFLO_BASE_URL?.trim();
  if (!value) {
    exit(
      "PERFLO_BASE_URL is not set.",
      "",
      "Run: cp .env.example .env",
      "Then check that PERFLO_BASE_URL points at your API.",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return exit(
      `PERFLO_BASE_URL is not a valid URL: ${value}`,
      "",
      "It should look like https://api.example.com with no trailing slash.",
    );
  }

  // Your key is a bearer token. Over plain http anything on the network path
  // can read it, so refuse rather than leak it.
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !loopback) {
    exit(
      `PERFLO_BASE_URL must use https. Yours uses ${url.protocol}`,
      "",
      "Your key is sent as a bearer token on every request. Over http it is",
      "readable by anything between you and the server.",
    );
  }
  return value;
}

function readKey(name: "PERFLO_AGENT_KEY" | "PERFLO_ACCOUNT_KEY", what: string): string {
  const value = process.env[name]?.trim();
  const wanted = PREFIXES[name];

  if (!value || value.endsWith("replace_me")) {
    exit(
      `  ${name} is not set.`,
      "",
      `  You need ${what}`,
      "",
      "  How to get one:",
      "    1. Sign in to your Perflo dashboard.",
      "    2. Open the developer or builder section.",
      "    3. Create the key and copy it straight away. It is shown once and",
      "       cannot be recovered.",
      "",
      `  Then put it in .env as ${name}=...`,
      `  It should start with ${wanted[0]} or ${wanted[1]}.`,
    );
  }

  if (!wanted.some((prefix) => value.startsWith(prefix))) {
    const other = name === "PERFLO_AGENT_KEY" ? "PERFLO_ACCOUNT_KEY" : "PERFLO_AGENT_KEY";
    const looksLikeTheOther = PREFIXES[other].some((prefix) => value.startsWith(prefix));

    exit(
      `  ${name} does not look like the right kind of key.`,
      "",
      looksLikeTheOther
        ? `  That looks like your ${other}. The two are not interchangeable:`
        : "  Expected one of these prefixes:",
      looksLikeTheOther
        ? "  an agent key spends and cannot provision, an account key provisions"
        : `    ${wanted[0]}`,
      looksLikeTheOther
        ? "  and cannot spend. Swap them around in .env."
        : `    ${wanted[1]}`,
      "",
      // Never print key material. The length and the part before the first
      // underscore are enough to identify a paste mistake.
      `  Yours is ${value.length} characters and starts "${value.split("_")[0]}_".`,
    );
  }
  return value;
}

/** A client that can spend. Use this for the individual track. */
export function agentClient(): Perflo {
  return new Perflo({
    baseUrl: baseUrl(),
    key: readKey("PERFLO_AGENT_KEY", "an AGENT key. It is the credential that spends money."),
  });
}

/** A client that provisions and reads, and can never spend. Builder track. */
export function accountClient(): Perflo {
  return new Perflo({
    baseUrl: baseUrl(),
    key: readKey(
      "PERFLO_ACCOUNT_KEY",
      "an ACCOUNT key. It creates envelopes and keys, and it cannot spend.",
    ),
  });
}

/** A client for a key you just minted, so you can spend as that tenant. */
export function clientForKey(key: string): Perflo {
  return new Perflo({ baseUrl: baseUrl(), key });
}

export function anthropicKey(): string {
  const value = process.env.ANTHROPIC_API_KEY?.trim();
  if (!value) {
    exit(
      "ANTHROPIC_API_KEY is not set.",
      "",
      "This example lets Claude decide when to spend, so it needs a Claude key.",
      "Get one at https://console.anthropic.com and put it in .env.",
      "",
      "Every other example in this repo runs without it.",
    );
  }
  return value;
}

/** Print an error the way a human wants to read it, then stop. */
export function exit(...lines: string[]): never {
  console.error("");
  for (const line of lines) console.error(line);
  console.error("");
  process.exit(1);
}
