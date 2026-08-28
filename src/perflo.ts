// A small typed client for the Perflo v1 API.
//
// This file has no dependencies beyond built-in fetch. Copy it into your own
// project if you want a starting point. There is nothing clever in it: types,
// one method per endpoint, and a single place where HTTP happens.
//
// Every response from the API has the same shape:
//   success: { "data": ..., "meta": { "requestId": "..." } }
//   failure: { "error": { "code", "message", "details" }, "meta": { "requestId" } }
//
// So this client unwraps "data" for you and turns "error" into a PerfloError
// that carries the code. Always branch on err.code, never on the message text.
// Codes are stable. Messages are not.

export interface Money {
  readonly amount: string;
  readonly currency: string;
}

/** A failure returned by the API, or a transport failure reaching it. */
export class PerfloError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details: Record<string, unknown> | undefined,
    readonly requestId: string | undefined,
  ) {
    super(message);
    this.name = "PerfloError";
  }
}

export interface VendorResult {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly capability: string;
  /** The true unit price. Do not budget against this. */
  readonly price: Money;
  /** Budget against THIS. It is the ceiling the pay route enforces. */
  readonly maxChargePerCall: Money;
  readonly pricingUnit: "call" | "item";
  readonly payable: boolean;
  readonly unpayableReason?: string;
  readonly isPrimary: boolean;
}

export interface PayResult {
  readonly transactionId: string;
  readonly slug: string;
  readonly status: string;
  readonly charged: Money;
  readonly chargedTo: "credit" | "wallet" | null;
  readonly subAccount: string;
  readonly remaining: Money;
  readonly subAccountRemaining?: Money;
  readonly output?: unknown;
  readonly failure?: { readonly reason?: string };
}

export interface TaskResult {
  readonly id: string;
  readonly status: string;
  readonly terminal: boolean;
  readonly slug?: string;
  readonly transactionId?: string;
  readonly charged?: Money;
  readonly output?: unknown;
}

export interface WindowUsage {
  readonly cap: Money;
  readonly spent: Money;
  readonly remaining: Money;
  readonly resetsAt: string | null;
}

export interface SubAccount {
  readonly id: string;
  readonly label: string;
  readonly status: string;
  readonly limits: Partial<Record<"hourly" | "daily" | "monthly" | "total", WindowUsage>>;
  readonly createdAt: string;
}

/** What GET /v1/key returns. An agent key's own envelope and headroom. */
export interface KeySelf {
  readonly id: string;
  readonly name: string | null;
  /** "agent" or "account". This is how you tell a key's kind apart. */
  readonly scope: string;
  readonly subAccount: { readonly id: string; readonly label: string };
  readonly limits: Partial<Record<"hourly" | "daily" | "monthly" | "total", WindowUsage>>;
}

/** One field of a vendor's request contract. `in` says where the field goes. */
export interface VendorField {
  readonly name: string;
  readonly in: "body" | "query";
  readonly required: boolean;
  readonly type?: string;
  readonly description?: string;
}

/** GET /v1/vendors/{slug}. Ask this instead of guessing a vendor's fields. */
export interface VendorContract {
  readonly slug: string;
  readonly name: string;
  readonly price: Money;
  readonly maxChargePerCall: Money;
  readonly payable: boolean;
  readonly input?: { readonly fields: readonly VendorField[] };
}

export interface MintedKey {
  readonly id: string;
  readonly name: string;
  readonly subAccount: { readonly id: string; readonly label: string };
  /** On the wire exactly once. Store it now or lose it. */
  readonly key: string;
  readonly lastFour: string;
}

/** A key as it appears in GET /v1/keys. No secret, by design. */
export interface KeySummary {
  readonly id: string;
  readonly name: string;
  readonly lastFour: string;
  readonly subAccount?: { readonly id: string; readonly label: string };
  readonly revokedAt?: string | null;
}

export interface StatementLine {
  readonly subAccount?: string | null;
  readonly capability?: string | null;
  readonly calls: number;
  readonly charged: Money;
}

export interface Statement {
  readonly period: string;
  readonly closed: string | null;
  readonly openingBalance: Money;
  readonly closingBalance: Money;
  readonly totalCharged: Money;
  readonly totalCredited: Money;
  readonly totalSettled: Money;
  readonly owedAtClose: Money;
  readonly byCapability: readonly StatementLine[];
  readonly bySubAccount: readonly StatementLine[];
  readonly summary: string;
}

export interface Transaction {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly ledgerState: "pending" | "posted" | "voided";
  readonly slug?: string;
  readonly capability?: string;
  readonly subAccount?: string;
  /** Signed. Negative is money leaving. */
  readonly amount: Money;
  readonly createdAt: string;
}

/** GET /v1/balance. Account level, so an account key only. */
export interface Balance {
  /** creditBalance + walletHeadroom. The one number before spending. */
  readonly spendable: Money;
  readonly creditBalance: Money;
  readonly walletHeadroom: Money;
  readonly owed: Money;
  readonly asOf: string;
}

export interface CapWindows {
  readonly hourly?: Money;
  readonly daily?: Money;
  readonly monthly?: Money;
  readonly total?: Money;
}

export class Perflo {
  private readonly baseUrl: string;
  private readonly key: string;

  constructor(options: { baseUrl: string; key: string }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.key = options.key;
  }

  // ---- discovery. free, nothing is charged ------------------------------

  /** Find vendors from a plain English description of the work. */
  search(query: string, limit = 5): Promise<VendorResult[]> {
    return this.call<VendorResult[]>("POST", "/v1/search", { query, limit });
  }

  // ---- spending. an agent key only --------------------------------------

  /**
   * Describe a job in plain English. We pick the vendor, build the request,
   * pay, and fail over to the next vendor if one fails. A failed call is not
   * charged.
   */
  task(
    task: string,
    input: Record<string, unknown> = {},
    subAccountId?: string,
  ): Promise<TaskResult> {
    const body: Record<string, unknown> = { task, input };
    // Only send it when you mean it. A key already knows its envelope, and
    // naming a different one is refused rather than quietly redirected.
    if (subAccountId) body.subAccountId = subAccountId;
    return this.call<TaskResult>("POST", "/v1/tasks", body);
  }

  /** Pay one vendor you have already chosen. */
  pay(
    slug: string,
    body: {
      input?: Record<string, unknown>;
      query?: Record<string, unknown>;
      maxCharge?: Money;
      subAccountId?: string;
    },
    idempotencyKey?: string,
  ): Promise<PayResult> {
    return this.call<PayResult>("POST", `/v1/pay/${encodeURIComponent(slug)}`, body, idempotencyKey);
  }

  /**
   * How much may THIS key still spend, and which kind of key it is.
   *
   * An agent key cannot read /v1/balance, so this is its self-read. It takes no
   * input because the key already names its envelope server-side. `scope` tells
   * you whether you are holding an agent key or an account key, which the key
   * string itself does not.
   *
   * Only an agent key can call this. An account key has no single envelope to
   * report, so it gets a 401 pointing at GET /v1/sub-accounts/{id} instead.
   */
  self(): Promise<KeySelf> {
    return this.call<KeySelf>("GET", "/v1/key");
  }

  /**
   * One vendor's contract, including which fields go in the body and which go
   * in the query string. Free.
   *
   * Ask this before calling pay() on a vendor you have not called before. Do
   * not guess field placement, and never build the query string yourself.
   */
  vendor(slug: string): Promise<VendorContract> {
    return this.call<VendorContract>("GET", `/v1/vendors/${encodeURIComponent(slug)}`);
  }

  // ---- provisioning. an account key only --------------------------------

  /**
   * Create a spending envelope.
   *
   * An hourly cap is required whenever any other cap is set, and caps must not
   * decrease outward: hourly <= daily <= monthly <= total.
   */
  createSubAccount(label: string, limits?: CapWindows): Promise<SubAccount> {
    const body: Record<string, unknown> = { label };
    if (limits) body.limits = toMoneyMap(limits);
    return this.call<SubAccount>("POST", "/v1/sub-accounts", body);
  }

  /**
   * Change an envelope's caps.
   *
   * limits is REPLACED, not merged. A window you leave out is cleared.
   */
  patchSubAccount(selector: string, limits: CapWindows): Promise<SubAccount> {
    return this.call<SubAccount>("PATCH", `/v1/sub-accounts/${encodeURIComponent(selector)}`, {
      limits: toMoneyMap(limits),
    });
  }

  listSubAccounts(): Promise<SubAccount[]> {
    return this.call<SubAccount[]>("GET", "/v1/sub-accounts");
  }

  /** Create an agent key locked to one envelope. The secret is returned once. */
  mintKey(name: string, subAccountId: string): Promise<MintedKey> {
    return this.call<MintedKey>("POST", "/v1/keys", { name, subAccountId });
  }

  /** Every key on the account. The secrets are not in the list, only metadata. */
  listKeys(): Promise<KeySummary[]> {
    return this.call<KeySummary[]>("GET", "/v1/keys");
  }

  /**
   * Revoke a key. It stops working on its very next request, with no grace
   * period, so mint and deploy the replacement BEFORE you revoke the old one.
   */
  revokeKey(id: string): Promise<unknown> {
    return this.call<unknown>("DELETE", `/v1/keys/${encodeURIComponent(id)}`);
  }

  // ---- reading -----------------------------------------------------------

  statement(period?: string): Promise<Statement> {
    const q = period ? `?period=${encodeURIComponent(period)}` : "";
    return this.call<Statement>("GET", `/v1/statement${q}`);
  }

  /**
   * The ledger, newest first.
   *
   * `from` and `to` are ISO 8601 bounds on createdAt. Use them plus `offset` to
   * bill on a cycle that is not a calendar month.
   *
   * Pagination totals live in `meta`, not in the rows, so this returns both.
   * Sum `amount` only where `ledgerState` is "posted".
   */
  async transactions(
    params: {
      subAccount?: string;
      slug?: string;
      capability?: string;
      from?: string;
      to?: string;
      ledgerState?: "pending" | "posted" | "voided";
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ rows: Transaction[]; total: number }> {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) q.set(key, String(value));
    }
    if (!q.has("limit")) q.set("limit", "20");
    const { data, meta } = await this.envelope<Transaction[]>(
      "GET",
      `/v1/transactions?${q.toString()}`,
    );
    return { rows: data, total: meta.total ?? data.length };
  }

  balance(): Promise<Balance> {
    return this.call<Balance>("GET", "/v1/balance");
  }

  // ---- the one place HTTP happens ---------------------------------------

  /** The last successful response's requestId. Quote it in a support ticket. */
  lastRequestId: string | undefined;

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const { data } = await this.envelope<T>(method, path, body, idempotencyKey);
    return data;
  }

  private async envelope<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<{ data: T; meta: { requestId?: string; total?: number } }> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.key}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        // Always bound a money call. Without a timeout a hung request holds your
        // thread open and you never learn whether the charge landed. If this
        // fires on a paid route, do not blind-retry: read GET /v1/transactions
        // first to see whether the charge is already there.
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new PerfloError(
        "NETWORK_ERROR",
        `Could not reach ${this.baseUrl}. Check PERFLO_BASE_URL and your connection.`,
        0,
        undefined,
        undefined,
      );
    }

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new PerfloError(
        "BAD_RESPONSE",
        `${method} ${path} returned status ${res.status} and a body that is not JSON.`,
        res.status,
        { body: text.slice(0, 500) },
        undefined,
      );
    }

    const envelope = parsed as {
      data?: T;
      error?: { code?: string; message?: string; details?: Record<string, unknown> };
      meta?: { requestId?: string; total?: number };
    };
    const requestId = envelope.meta?.requestId;

    if (!res.ok || envelope.error) {
      throw new PerfloError(
        envelope.error?.code ?? `HTTP_${res.status}`,
        envelope.error?.message ?? `${method} ${path} failed with status ${res.status}.`,
        res.status,
        envelope.error?.details,
        requestId,
      );
    }
    this.lastRequestId = requestId;
    return { data: envelope.data as T, meta: envelope.meta ?? {} };
  }
}

function toMoneyMap(limits: CapWindows): Record<string, Money> {
  const out: Record<string, Money> = {};
  for (const [window, amount] of Object.entries(limits)) {
    if (amount) out[window] = amount;
  }
  return out;
}

/** Build a money object. usd("0.05") is { amount: "0.05", currency: "USD" }. */
export function usd(amount: string): Money {
  return { amount, currency: "USD" };
}
