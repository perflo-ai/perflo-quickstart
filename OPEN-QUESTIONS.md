# Open questions

This repo shows you how to spend money safely from an agent. It does not answer
everything you will need before you put this in production.

Rather than let you discover that list yourself, here it is. Every item is a
question to ask us, and we would rather you asked early.

## Money in

- **How do you add funds once the $3.00 of signup credit is gone?** There is no
  funding endpoint in this repo. Ask us for the current process.
- **Is there auto top-up, and a low-balance alert?** Today you would poll
  `GET /v1/balance` yourself. There is no webhook.
- **What are the caps in your account's own spending policy?** An account-level
  policy sits above every envelope. `GET /v1/spending-policy` reads it. If your
  envelope caps add up to more than that policy allows, the policy wins.

## Multi-tenancy at scale

- **Envelope caps do not reserve funds.** They are limits on a shared balance,
  not per-customer guarantees. If the sum of your customers' caps exceeds your
  balance, the customers who spend first can exhaust it and every other customer
  gets `INSUFFICIENT_BALANCE`. Ask us about reservations before you rely on caps
  as a per-tenant promise.
- **Kill switches are account-scoped.** One customer's agent key can revoke the
  account spending policy and halt every other customer. It cannot spend their
  money. See `docs/credentials.md`.
- **Are purchased resources scoped per envelope?** `GET /v1/resources` is
  account-wide. If you buy things that carry value, ask how they are scoped
  before you resell them.

## Failure and retries

- **`POST /v1/tasks` and idempotency.** `POST /v1/pay/{slug}` documents an
  `Idempotency-Key` header. `/v1/tasks` does not. If a task call times out, do
  not blind-retry: read `GET /v1/transactions` first and look for the charge.
  Ask us what the supported retry story is.
- **A retry under a used idempotency key is refused, not replayed.** So a
  dropped connection after a successful charge loses the output. Ask whether a
  replay can return the original response.
- **No published rate limits.** `429 RATE_LIMITED` is documented, the numbers
  are not, and discovery routes are limited per IP so one busy customer can
  affect the others.

## Billing and finance

- **Statements are calendar months.** For any other cycle, build it from
  `GET /v1/transactions` with `from` and `to`.
- **Is a closed month final?** Statements are rebuilt from the ledger, and a
  refund is an `adjustment` row. Ask whether an adjustment can land after a
  month closes before you invoice from one.
- **Tax, VAT, and who is merchant of record.** Not covered here. Your finance
  team will ask.
- **Refunds and disputes.** A refund appears in the ledger as an `adjustment`.
  There is no documented process for requesting one.

## Compliance

- **Your task text goes to third-party vendors**, and which vendor is chosen by
  our ranker, which can change. If you need a named subprocessor list, data
  residency, a DPA, or a retention and deletion policy, ask before you build.
- **Availability.** No SLA or status page is referenced here.

## The one question worth sending first

> One of my customers' agent keys is stolen at 2am. What is the maximum that can
> leave my account before I can stop it, and how much of that is on a path my
> envelope caps do **not** bound?

If you send us one thing, send that. It is the question that decides how you
architect around this, and the answer names every control you actually have.

Interim answer from this repo: zero the envelope's caps with
`PATCH /v1/sub-accounts/{id}`, which stops every key on it in one call, then
revoke. `docs/credentials.md` has the full runbook.
