# Perflo quickstart

Give an AI agent a spending budget it cannot exceed.

Your agent finds a paid API, pays for one call, and gets the answer back. You do
not create a wallet, hold a private key, or write any blockchain code. You set a
limit, and the limit is checked on our side before any money moves.

This repo is runnable. Every example is one short TypeScript file. Nothing is
hidden behind a framework.

```bash
git clone <this-repo> && cd perflo-quickstart
pnpm install
pnpm start
```

`pnpm start` asks you one question and runs the right first example for you.

Using npm or yarn instead? `npm install`, then `npm run individual:01`. Every
`pnpm x` below works as `npm run x`.

---

## Before you start

1. **An account.** Sign in to your Perflo dashboard. Every new account is
   created with **$3.00 of credit**, which is enough to run everything here
   several times over.
2. **Node 22 or newer.** Check with `node --version`.
3. **One key from the dashboard.** Which one depends on your track, below.

You do not need an Anthropic key unless you run `individual/02`, where Claude
decides when to spend.

**On money.** Everything in this repo spends from your real balance, starting
with that $3.00 of credit. There is no separate sandbox that returns fake data:
a paid call pays a real vendor and returns real data. That is why every example
that can be charged asks you first.

---

## Pick your track

### Track 1: individual

You want your own agent to spend your own money.

You need a **PERFLO_AGENT_KEY**.

```bash
cp .env.example .env      # then paste your agent key into it
pnpm individual:01        # your first paid call, a few cents
pnpm individual:02        # let Claude decide when to spend
pnpm individual:03        # watch a spend get refused
```

### Track 2: builder

You are building a product, and each of your customers needs a separate budget.

You need a **PERFLO_ACCOUNT_KEY**. That single key is all your server needs.

```bash
cp .env.example .env      # then paste your account key into it
pnpm builder:01           # create two customer budgets
pnpm builder:02           # spend as one customer
pnpm builder:03           # one customer runs out, the others keep working
pnpm builder:04           # see what each customer cost you, free
pnpm builder:05           # revoke the demo keys, free
```

`builder:01` mints two **live** spending keys and writes them **in plaintext**
to `.tenants.json`. That file is demo storage, not a design to copy. Run
`pnpm builder:05` when you are done, to revoke them and delete it.

Read `builder/README.md` for the full explanation of the model.

---

## How to get a key

1. Sign in to your Perflo dashboard.
2. Open the developer or builder section.
3. Create the key.
4. Copy it immediately.

**A key is shown once and is never recoverable.** We store only a hash of it and
the last four characters. If you lose one, revoke it and create another.

The prefix tells you which kind you are holding, and which environment it came
from:

| Prefix | Kind | Environment |
|---|---|---|
| `perflo_live_` | agent key, spends | production |
| `perflo_test_` | agent key, spends | everywhere else |
| `perflo_admin_live_` | account key, provisions | production |
| `perflo_admin_test_` | account key, provisions | everywhere else |

You do not choose `live` or `test`. The environment you are pointed at decides.
Against production you get `live` keys, and they move real money.

Holding a key and unsure which it is? Call `GET /v1/key` and read `scope`. An
agent key answers; an account key does not.

---

## The two kinds of key

This is the one concept worth understanding before you write any code.

A **spending envelope** is a budget with limits on it. In the API it is called a
sub-account, which is why the routes are `/v1/sub-accounts`. One account can
have many.

| | Agent key | Account key |
|---|---|---|
| Pays a vendor | Yes | **No** |
| Creates keys or envelopes | No | Yes |
| Changes a spending limit | No | Yes |
| Sees | Its own envelope, plus the account's spending policy | The whole account |
| Lives | With the agent | On your server |

An **agent key** is locked to one envelope when it is created. It cannot be
pointed elsewhere later. If it asks to spend from a different envelope, the
request is refused rather than quietly redirected.

An **account key** cannot pay a vendor directly. **It is still your most
sensitive credential**: it can raise any envelope's limits and mint a new agent
key inside it, which is two calls away from spending your whole balance. Treat
it as a root credential and keep it in your secret store.

What the no-spend rule buys you is narrower than it sounds, and still valuable:
a stolen **agent** key cannot widen its own budget. Its caps hold.

**Nothing that can spend is allowed to widen its own budget.** That single rule
explains most of the API's shape.

---

## Nothing here spends money without asking

Every example that can be charged prints the worst case cost and waits for you
to type `y`.

```bash
pnpm individual:01 --dry-run   # do the free steps, stop before spending
pnpm individual:01 --yes       # skip the prompt, when you are ready
```

`--dry-run` still needs a working key, because the free steps are real API
calls. What it will not do is spend. `DRY_RUN=1` in your `.env` does the same
thing everywhere.

Two examples never charge you at all: `builder:04` and `builder:05`.

---

## Refusals are free, with two exceptions worth knowing

| Code | Meaning | Charged? |
|---|---|---|
| `MAX_CHARGE_EXCEEDED` | Your per-call ceiling was below the price. | No |
| `GUARDRAIL_DENIED` | An hourly, daily or monthly limit ran out. | No |
| `INSUFFICIENT_BALANCE` | The whole account is out of money. | No |
| `SCHEMA_VALIDATION_FAILED` | Your request was missing a field the vendor needs. | No |
| `VENDOR_NOT_PAYABLE` | That vendor is switched off. | No |

Those are all decided before a payment is built.

**Exception one.** A vendor that answers and *then* reports a failure returns
HTTP 200 with `status: "failed"`, and **you were charged**. So check `status`,
not just the HTTP code.

**Exception two.** `VENDOR_ERROR` usually means nothing was charged, but it can
leave a real debit. Read `details.netDebit`, which says what stands charged.

The difference that matters most day to day: `GUARDRAIL_DENIED` stops **one**
envelope and the others keep working. `INSUFFICIENT_BALANCE` stops **every**
envelope at once.

Full list with fixes: `docs/errors.md`.

---

## What is in this repo

```
src/perflo.ts        The whole client. Plain fetch, no dependencies. Copy it.
src/explain.ts       Turns an error code into plain English and a fix.
src/env.ts           Reads .env and fails with instructions, not a stack trace.
src/confirm.ts       Prints the cost and waits for you before any spend.
src/start.ts         The picker behind `pnpm start`.

individual/01        Search for free, then pay for one job.
individual/02        Claude gets one paid tool and decides when to use it.
individual/03        Trigger a refusal on purpose.

builder/01           Create an envelope and a key per customer.
builder/02           Spend as one customer. Prove a key cannot cross over.
builder/03           One customer runs out, the others do not notice.
builder/04           What each customer cost you this month. Free.
builder/05           Revoke the demo keys and delete the file. Free.
builder/tenants.ts   Demo-only storage for the keys 01 mints.

inspector/           Optional local page that shows charges as they land.

docs/credentials.md  The two key types, rotation, and what to do on a leak.
docs/errors.md       The error codes you will meet here, and what to do.
docs/endpoints.md    Every endpoint this repo calls.
OPEN-QUESTIONS.md    What this repo does not answer yet. Read before you commit.
```

---

## Look before you sign up

One endpoint needs no key at all, so you can see the catalog right now:

```bash
curl -s "https://agent-mode-backend-prod-merge.up.railway.app/v1/capabilities"
```

## The three calls that matter

Everything else is detail. Load your `.env` into the shell first, or these will
fail with an empty URL:

```bash
set -a; source .env; set +a
```

**Find something, for free.**

```bash
curl -s -X POST "$PERFLO_BASE_URL/v1/search" \
  -H "Authorization: Bearer $PERFLO_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"search the web for recent news","limit":3}'
```

**Get a job done, and pay for it.**

```bash
curl -s -X POST "$PERFLO_BASE_URL/v1/tasks" \
  -H "Authorization: Bearer $PERFLO_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"task":"find the CEO of Stripe","input":{}}'
```

We pick the vendor, build the request, pay, and fail over to another vendor if
the first one fails.

**See what it cost.**

```bash
curl -s "$PERFLO_BASE_URL/v1/transactions?limit=5" \
  -H "Authorization: Bearer $PERFLO_AGENT_KEY"
```

---

## Let your coding agent read the reference

The API reference is published as one file written for language models:

```
$PERFLO_BASE_URL/llms.txt
```

Point your coding agent at it and ask it to write the integration. It covers
most endpoints with the reasoning behind each one. It is generated from the
backend and can lag the API by a release, so treat this repo's `docs/` as the
narrower but more current source, and check anything surprising against a real
response.

---

## Common problems

**`PERFLO_AGENT_KEY is not set`**
You have not created `.env`, or you left the placeholder in it. Run
`cp .env.example .env` and paste your real key.

**`PERFLO_ACCOUNT_KEY does not look like the right kind of key`**
You pasted an agent key where an account key belongs, or the reverse. Account
keys start `perflo_admin_`. The message tells you which way round it is.

**`UNAUTHENTICATED`**
The key is wrong or has been revoked. Revocation takes effect on the very next
request with no grace period. Create a new key.

**`ACCOUNT_KEY_CANNOT_SPEND`**
You put an account key where an agent key belongs. Account keys provision, agent
keys spend.

**`ACCOUNT_KEY_REQUIRED`**
The opposite. You used an agent key on a route that provisions, or that reads
account-wide data such as `/v1/statement`.

**`KEY_SUB_ACCOUNT_MISMATCH`**
Your request named an envelope and the key is locked to a different one. The
simplest fix is to send no envelope at all. The key already knows.

**`No customers found yet`**
A builder example ran before `builder:01`. Run `pnpm builder:01` first.

**Something else**
Every response carries a `requestId` in `meta`. Quote it if you contact support
and we can find the exact request.

---

## Where to go next

1. Read `OPEN-QUESTIONS.md`. It lists what this repo does not answer yet, so you
   find out from us rather than from production.
2. Read `docs/credentials.md` and decide which keys your product needs.
3. Copy `src/perflo.ts` into your project, or write your own client. It is plain
   HTTP with a bearer token and there is nothing special about it.
4. Set real limits for your first customer.
