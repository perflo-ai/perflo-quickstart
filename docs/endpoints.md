# Endpoints this repo uses

Everything here is on `/v1`. Base URL comes from `PERFLO_BASE_URL`.

The full reference for every endpoint, not just the ones used here, is published
at `$PERFLO_BASE_URL/llms.txt`. It is written for language models, so you can
point a coding agent at it.

## Discovery. Free, nothing is charged.

| Endpoint | Credential | Notes |
|---|---|---|
| `POST /v1/search` | either | Find vendors from plain English. Ranked best first. |
| `GET /v1/search` | either | Same thing as a query string, when a GET is easier. |
| `GET /v1/vendors/{slug}` | either | One vendor's contract. Returns one `input.fields[]` list, each field carrying `in: "body"` or `in: "query"`, plus `schemaConfidence`. |
| `GET /v1/capabilities` | none | The catalog menu. Public, no key needed. |

There is also `GET /v1/capabilities`, which returns a browsable menu of groups
and categories. It needs no key at all, so you can look at the catalog before you
have an account:

```bash
curl -s "$PERFLO_BASE_URL/v1/capabilities"
```

Use the menu when you want to show a user what is on offer. Use search when you
have a job to do and want the right vendor for it.

### Reading a search result

```json
{
  "slug": "stableenrich-firecrawl-search",
  "price":            { "amount": "0.0252", "currency": "USD" },
  "maxChargePerCall": { "amount": "0.0252", "currency": "USD" },
  "pricingUnit": "call",
  "payable": true,
  "isPrimary": true
}
```

- `price` is the true unit price.
- **`maxChargePerCall` is what you budget against.** For most vendors it equals
  `price`. For some it is much larger, because it is the worst case a single call
  can settle at. A `maxCharge` set from `price` gets refused on those.
- `payable: false` means the pay route will refuse it. Skip it. `unpayableReason`
  says why in words.
- `isPrimary` marks the vendor the router would pick for that capability.
- No match is `200` with an empty list, not an error.
- `limit` is clamped, never rejected.

## Spending. Agent key only.

| Endpoint | Cost | Notes |
|---|---|---|
| `POST /v1/tasks` | Yes | Describe a job. We pick, build, pay, and fail over. |
| `POST /v1/pay/{slug}` | Yes | Pay one vendor you already chose. |
| `POST /v1/transfers` | Yes | Send money to an address. See the warning below. |

### `POST /v1/tasks`

```json
{ "task": "find the CEO of Stripe", "input": {} }
```

Use this when you do not want to choose a vendor. It picks the best one, builds
the request from that vendor's schema, pays, and moves to the next vendor if one
fails. **A failed call is not charged.**

There is no `maxCharge` on this route, and sending one is a `422` that names the
field. It was removed because it used to be checked against the result, which
meant a breach returned an error after you had already been charged. What bounds
a task instead is your envelope's hourly, daily, monthly and total caps, which
are checked before any payment is built.

A logical failure never returns 200 on this route.

### `POST /v1/transfers` needs an allowlist before you hand out keys

This route takes a `recipient` address directly. There is no registration step,
and the address allowlist is **off unless you set it**. Until you put
`allowedRecipients` on the account's spending policy, any agent key can send to
any address, bounded only by your caps.

If you give agent keys to customers, set that allowlist first.

### `POST /v1/pay/{slug}`

```json
{
  "input": { "query": "x402 protocol", "limit": 5 },
  "maxCharge": { "amount": "0.05", "currency": "USD" }
}
```

Use this when you know the vendor. It keeps `maxCharge`, which is checked against
the catalog price before any network call, so a ceiling that is too low costs you
nothing.

Some vendors take their inputs as query parameters instead of a body. Those go in
`query`, not `input`. `GET /v1/vendors/{slug}` tells you which field goes where.
Do not guess, and never build the query string yourself.

Send an `Idempotency-Key` header. It is what stops a dropped connection from
paying twice. A retry under a key that already charged is refused, never charged
again.

## Provisioning. Account key only.

| Endpoint | Notes |
|---|---|
| `POST /v1/sub-accounts` | Create an envelope with limits. |
| `PATCH /v1/sub-accounts/{id}` | Change an envelope's label or limits. |
| `DELETE /v1/sub-accounts/{id}` | Switch one envelope off. |
| `POST /v1/keys` | Create an agent key locked to one envelope. |
| `GET /v1/keys` | List keys. The secret is not in the list. |
| `DELETE /v1/keys/{id}` | Revoke a key. Effective on its next request. |

Both fields are required when you create a key, and the body is strict. An
unknown field is a `422`, not a silently ignored one.

There is no bulk delete on `/v1/sub-accounts`. It answers `405` on purpose,
because "delete all" and "delete the ones I list" read the same and guessing
wrong would switch off every budget on the account.

## Reading

| Endpoint | Credential | Notes |
|---|---|---|
| `GET /v1/key` | agent | This key's own envelope and headroom. Takes no input. |
| `GET /v1/sub-accounts` | either | An agent key sees only its own envelope. |
| `GET /v1/transactions` | either | An agent key sees only its own rows. |
| `GET /v1/balance` | account | Account level. An agent key is refused. |
| `GET /v1/statement` | account | One month, by customer and by capability. |
| `GET /v1/resources` | account | Things you bought that persist. |

### Reading transactions

Two fields carry the meaning.

**`ledgerState`** is `pending`, `posted` or `voided`. It decides whether the row
is in your balance. `status` says where the run got to, and the two are allowed
to disagree.

**`amount` is signed.** Negative is money leaving. So you sum the column without
branching on `kind`.

To reconcile your own total, **sum `amount` where `ledgerState` is `posted`**.
Summing every row overstates your spend by whatever is pending or voided.

Useful filters: `subAccount`, `slug`, `capability`, `from`, `to`, `kind`,
`ledgerState`, `status`, `limit`, `offset`. Pagination lives in `meta`, not in
`data`.

One thing to know about `kind`: the default is `payment,credit,adjustment`. A
refund is an `adjustment`, so leaving the default alone means you see reversals
next to the charges they reverse.

### Reading the statement

```
GET /v1/statement?period=2026-08
```

Gives you `bySubAccount` and `byCapability`, plus the totals.

The roll forward is an identity you can check:

```
closingBalance = openingBalance + totalCredited + totalSettled - totalCharged
```

Only `posted` rows count. `closed` is `null` while the month is open. Ask for a
past month and you get the same numbers every time, because it is rebuilt from
the ledger rather than from today's balances.

One naming trap worth knowing. `owedAtClose` here is what was outstanding at the
close of that window. `owed` on `GET /v1/balance` is what you owe right now. They
are different quantities and they only agree when you ask for the current period
and nothing has settled since.
