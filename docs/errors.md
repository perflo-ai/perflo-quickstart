# Error codes you will meet in this repo

This is not every code the API can return. It is the set the examples here can
produce, plus the ones you are most likely to hit next.

Every failure has the same shape:

```json
{
  "error": {
    "code": "GUARDRAIL_DENIED",
    "message": "...",
    "details": { "reason": "hourly_limit_exceeded" }
  },
  "meta": { "requestId": "3f0c..." }
}
```

**Branch on `code`. Never on `message`.** Codes are part of the contract and do
not change. Messages are prose and may be reworded at any time.

`details` carries the specifics. `requestId` identifies the exact request, so
quote it if you contact support.

---

## Was I charged?

This is usually the only question you care about, so it comes first.

| Code | Charged? |
|---|---|
| `GUARDRAIL_DENIED` | No |
| `INSUFFICIENT_BALANCE` | No |
| `MAX_CHARGE_EXCEEDED` | No |
| `VALIDATION_ERROR` | No |
| `SCHEMA_VALIDATION_FAILED` | No |
| `VENDOR_NOT_PAYABLE` | No |
| `VENDOR_NOT_FOUND` | No |
| `SUB_ACCOUNT_NOT_FOUND` | No |
| `KEY_SUB_ACCOUNT_MISMATCH` | No |
| `ACCOUNT_KEY_CANNOT_SPEND` | No |
| `VENDOR_ERROR` | **Usually** no. Read `details.netDebit`. |
| HTTP 200 with `status: "failed"` | **Yes.** See the note at the bottom. |

Every refusal above is decided before a payment is built. A refusal is never a
charge you have to reverse.

---

## Authentication and credentials

### `401 UNAUTHENTICATED`
The key was missing, malformed, or revoked.

Revocation takes effect on the very next request, with no grace period. Create a
new key.

### `403 ACCOUNT_KEY_CANNOT_SPEND`
You used an account key on a route that spends.

Account keys provision and read. Use an agent key to pay, run a task, or
transfer.

### `403 ACCOUNT_KEY_REQUIRED`
The opposite. You used an agent key on a route that provisions, or that reads
account-wide data such as `/v1/balance` or `/v1/statement`.

### `403 KEY_CANNOT_MINT`
An agent key tried to create or revoke a key. It can never do that. Use your
account key, the dashboard, or the CLI.

### `403 KEY_SUB_ACCOUNT_MISMATCH`
Your request named an envelope, and the key is locked to a different one.

`details.subAccount` tells you which envelope the key is actually locked to.

The request is refused rather than quietly charged to the correct envelope,
because a caller that names an envelope and is charged elsewhere believes it has
a limit that it does not have.

**Fix:** send no envelope at all. The key already knows. Naming your own
envelope is fine, including by label and ignoring case, so echoing back what a
response told you is never punished.

---

## Spending limits

### `403 GUARDRAIL_DENIED`
A spending limit refused the call. Nothing was charged.

`details.reason` names the window, for example `hourly_limit_exceeded`.

**This stops one envelope only.** Every other envelope on the account keeps
working.

**Fix:** wait for the window to reset, or raise the cap with your account key.

### `402 INSUFFICIENT_BALANCE`
The account has run out of spendable money. Nothing was charged.

`details` carries `required`, `available` and `owed` as money objects.

**This stops every envelope at once.** No per-customer limit will warn you about
it, so monitor your account balance separately.

### `422 MAX_CHARGE_EXCEEDED`
Your `maxCharge` ceiling was below what the vendor can charge. Nothing was
charged.

**Fix:** budget from `maxChargePerCall` in the search result, not from `price`.
For most vendors those are the same number. For some they are very different, and
the check uses `maxChargePerCall`.

---

## Requests

### `422 SCHEMA_VALIDATION_FAILED`
The vendor's own schema rejected your `input`, before any payment. Free.

This is the code `POST /v1/tasks` returns for a body a vendor will not accept.
`details.requestSchema` shows the fields it wanted.

### `422 VALIDATION_ERROR`
The request was malformed or missing a required field. Refused for free, before
any payment.

**One caveat on "free".** The pay path can only check your body against a schema
it is confident about. `GET /v1/vendors/{slug}` publishes `schemaConfidence`.
When it is `high` or `medium`, a wrong body is refused for nothing. When it is
`low` or `null`, there is no confident shape to check, so a wrong body reaches
the vendor and **can cost money**. That is exactly why the field is published:
check it before you call a vendor you have not called before.

`details.requestSchema` shows the vendor's fields in two lists, `body[]` and
`query[]`. Put each field where its list says. Do not guess, and do not append a
query string yourself.

`GET /v1/vendors/{slug}` publishes the same information in a different shape:
one `input.fields[]` list, where each field carries `in: "body"` or
`in: "query"`. Same facts, one array instead of two.

`details.reason` appears on cap errors and names the rule you broke:

- `hourly_cap_required`: you set a cap without setting an hourly one.
- `window_ordering`: your caps shrink as the window grows.
- `capability_is_group`: you named a group where a category is required.
- `duplicate_capability`: the same category appears twice.
- `blocked_capability_has_limits`: you passed `allowed: false` alongside caps.

### `422 UNKNOWN_CAPABILITY`
You named a capability or category that does not exist.
`details.didYouMean` lists near matches.

### `409 CONFLICT`
The write clashed with something that exists. `details.reason` says which:

- `duplicate_label`: that envelope name is taken. Labels are unique ignoring
  case, so `Customer-A` collides with `customer-a`.
- `default_cannot_be_renamed`: the fallback envelope keeps its name.
- `sub_account_disabled`: the envelope is yours but switched off. Raised before
  anything is signed, so no money moved.

---

## Vendors

### `403 VENDOR_NOT_PAYABLE`
That vendor is blocked or switched off. Nothing was charged.

**Fix:** search results carry `payable` and `unpayableReason`. Skip a vendor with
`payable: false` instead of spending a request to find out.

### `404 VENDOR_NOT_FOUND`
No vendor has that slug. `details.didYouMean` lists near matches. Slugs come from
search results, so do not type them by hand.

### `502 VENDOR_ERROR`
We could not get a usable answer out of any candidate vendor.

**This is the one refusal that can still leave a debit.** Read
`details.netDebit`, which reports what stands charged. A task that fails can
have paid for a step along the way, and this error does not pretend otherwise.

Retry, or pick another vendor. Check `netDebit` before you retry so you know
what you already spent.

Note there are two `VENDOR_ERROR`s. This one is a 502. The same string can also
appear as `failure.code` inside an HTTP 200 body, where it means the vendor
answered and the task itself failed, and you were charged.

---

## Envelopes

### `404 SUB_ACCOUNT_NOT_FOUND`
The envelope does not exist, or it belongs to another account.

It is never a 403, deliberately. You cannot tell "does not exist" apart from
"not yours", so you cannot use the API to discover other people's envelopes.

---

## The one case where a failure did cost you

A vendor that answers and then reports a failure comes back as **HTTP 200** with
`status: "failed"` and a `failure` block. **You were charged**, and the response
says so.

That is a different thing from `502 VENDOR_ERROR`, which means no answer was
obtained and nothing was charged.

So when you check whether a call worked, check `status`, not just the HTTP code.

One helpful note: `POST /v1/tasks` never returns 200 for a logical failure. If
you want the strict behaviour, prefer it over `POST /v1/pay/{slug}`.

---

## Rate limits

### `429 RATE_LIMITED`
Too many requests. Back off and retry.

Two things to plan for. Discovery routes are rate limited **per IP address**,
even the ones that need no key, so if your server has one egress IP then all
your customers share one bucket and a busy customer can rate limit the others.
And no published numbers or `Retry-After` are documented yet, so use
exponential backoff rather than a fixed delay. This is on the open questions
list.
