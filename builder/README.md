# Builder track

You are building a product. Each of your customers needs their own budget, and
one customer must never be able to spend another customer's money.

## What you need

One key in `.env`:

```
PERFLO_ACCOUNT_KEY=perflo_test_...
```

That is the only credential your server needs. Everything in this track runs
with it.

**It cannot pay a vendor directly, but it is not the safe thing to hold.** It can
raise any envelope's limits and mint a new agent key inside it, so a stolen
account key is two calls from spending your balance. Treat it as a root
credential. What the no-spend rule buys you is that a stolen *customer* key
cannot widen its own budget.

## The model in one picture

```
your account
│
├── envelope "customer-a"     limits: $0.50/hour, $2/day
│     └── agent key ...4f2a   given to customer A's agent
│
└── envelope "customer-b"     limits: $1.00/hour, $5/day
      └── agent key ...9c31   given to customer B's agent
```

Two things exist per customer.

An **envelope** holds the limits. An **agent key** is locked to one envelope and
does the spending. You create both with your account key, then hand the agent key
to that customer's agent.

The lock is enforced on our side. A bug in your code cannot make customer A's key
spend from customer B's envelope. The request is refused, not redirected.

## The four examples

Run them in order. Each one prints the next command.

| Command | What it proves | Cost |
|---|---|---|
| `pnpm builder:01` | Your account key creates budgets and cannot spend | Free |
| `pnpm builder:02` | A customer's key sees and spends only its own budget | ~$0.03 |
| `pnpm builder:03` | One customer running out does not affect the others | ~$0.08 |
| `pnpm builder:04` | What each customer cost you, ready for billing | Free |

Example 01 stores the keys it mints in `.tenants.json`, which is gitignored,
because a key is returned once and never again. Examples 02 to 04 read it back.

## The one thing envelope isolation does not cover

A customer's agent key cannot spend another customer's money. It **can** stop
every customer at once.

`DELETE /v1/spending-policy` is open to every credential on purpose, so a
compromised agent can always halt itself. But it is account-scoped: it revokes
every matching policy row on the account, and the response's `policiesRevoked`
is often more than one. After that, every customer's agent gets
`GUARDRAIL_DENIED` until you reinstate the policy.

So the isolation guarantee is about **money**, not availability. Plan for it:
revoke a leaked customer key promptly, and know that reinstating the account
spending policy is your recovery step.

## Two ceilings you will meet, and a third that exists

This trips up every integration once. You need to know which limit you hit.

**The envelope's own limit.** Hourly, daily, monthly, or total. When it runs out
you get `403 GUARDRAIL_DENIED`. **Only that customer stops.** Everyone else keeps
working.

**The account's spendable balance.** When that runs out you get
`402 INSUFFICIENT_BALANCE`. **Every customer stops at once.**

So envelope limits isolate your customers from each other. They do not isolate
them from an empty account. Monitor your account balance separately, because no
per-customer limit will warn you about it, and there is no low-balance webhook
yet. See `OPEN-QUESTIONS.md`.

**The third ceiling.** An envelope can also cap or block individual
capabilities, using `capabilityLimits` on `POST /v1/sub-accounts`. Those fail
with `CAPABILITY_LIMIT_EXCEEDED` or `CAPABILITY_NOT_ALLOWED`. No example here
uses them, and they are the cheapest way to shrink blast radius: an envelope
that can only run web searches is a much smaller problem than one that can call
anything at the same dollar limit.

## Cap rules to know before you copy the code

1. **An hourly cap is required whenever you set any other cap.** The hourly
   window is the floor.
2. **Caps must not shrink as the window grows.** `hourly` must be less than or
   equal to `daily`, then `monthly`, then `total`. A missing cap counts as
   infinite.
3. **Leave a window out and there is no limit at that window.** So
   `{"label":"x"}` on its own creates an uncapped envelope. Uncapped is not
   unlimited, because your account balance still binds it.
4. **On an update, `limits` is replaced, not merged.** A window you leave out of
   a `limits` object you send is cleared. Send all the windows you want to keep.
   Sending `{"limits":{}}` removes every cap.
5. **Labels are unique, ignoring case.** `Customer-A` collides with
   `customer-a`, and you get `409 CONFLICT` with
   `details.reason = "duplicate_label"`.

## Billing

`GET /v1/statement` gives you one month, broken down by customer and by
capability, in a single call. Example 04 prints it.

Three things to know before you invoice from it:

1. **Periods are whole months**, written `YYYY-MM`. If you bill on each
   customer's own anniversary date, build that from `GET /v1/transactions`
   instead, which accepts `from` and `to`.
2. **Markup is your code.** This tells you what you were charged. What you charge
   your customer is your decision.
3. **An open month is not final.** `closed` is `null` until the month ends, and
   more charges can still land in it.

Ask for a past month and you get the same numbers every time, because it is
rebuilt from the ledger rather than from today's balances.

## Storing customer keys

`.tenants.json` is fine for this demo and wrong for production.

In your product, store each agent key against the customer it belongs to, in
whatever you already use for secrets. Never log a key. Never send one to a
browser. If a customer's key is exposed, revoke it and mint another, which is a
`DELETE /v1/keys/:id` followed by a `POST /v1/keys`.
