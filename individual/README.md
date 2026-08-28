# Individual track

You want your own agent to spend your own money, with a limit you set.

## What you need

One key in `.env`:

```
PERFLO_AGENT_KEY=perflo_test_...
```

An agent key is the credential that spends. It is locked to one spending
envelope and it cannot change its own limits.

For example 02 only, you also need `ANTHROPIC_API_KEY`.

## The three examples

### `01-first-paid-task.ts`

```bash
pnpm individual:01
```

Searching is free, so the example looks at real prices before it commits. Then
one call does the whole job: pick a vendor, build the request, pay, and return
the answer. Finally it reads the ledger so you can see the charge.

Costs about $0.03. It asks first.

### `02-claude-spends.ts`

```bash
pnpm individual:02
```

Claude gets exactly one tool that costs money, plus a job. It decides whether to
spend and what to ask for. You do not name a vendor, a price, or a request body
anywhere in the file.

This is the example worth showing someone else. It is the difference between a
script with an API key and an agent with a budget.

Costs whatever Claude decides to spend, up to the `BUDGET_USD` ceiling in the
file, plus a few cents of Claude tokens.

**Read this before you copy the loop.** The vendor's answer is untrusted text,
and this example hands it straight back to Claude. A page you paid to scrape can
contain instructions aimed at your model, telling it to spend again. That is not
a reason to avoid agents. It is the reason the real cap lives on the server:
`BUDGET_USD` is client-side, so a hijacked loop would ignore it, while the
envelope cap holds regardless. Size the envelope so a fully hijacked agent costs
you an amount you would shrug at.

The example pins a Claude model id. If your Anthropic key has no access to it,
you get a plain SDK error rather than a Perflo one. Change the model on the
`claude.messages.create` call.

### `03-cap-denies.ts`

```bash
pnpm individual:03
```

Deliberately triggers a refusal, so you can see that a refusal costs nothing.
It also explains the three refusals you will actually meet, and which of them
stops one budget rather than all of them.

Expected to cost nothing, and it asks before the one call that could change
that. The refusal is checked against the catalog price before any payment, so it
is normally free. It is not a guarantee: a vendor that fetches a live quote can
settle that quote first, and a vendor whose `schemaConfidence` is low has no
shape to check your body against. So the example confirms with you instead of
promising.

## Things you will want to know

**Your agent key cannot read the account balance.** That is on purpose. A
balance is an account level number, and under a real integration it is the wrong
answer to "what can I spend". Use `GET /v1/key` for your own envelope, which
example 01 does, or `GET /v1/sub-accounts`, which returns just your one
envelope. `GET /v1/key` also returns `scope`, which is how you tell an agent key
from an account key.

**Budget from `maxChargePerCall`, not from `price`.** For most vendors they are
the same number. For a few they are very different, and the per-call ceiling is
checked against `maxChargePerCall`. Budgeting from `price` gets you refused.

**You cannot raise your own limits with an agent key.** Nothing that spends is
allowed to widen its own budget. Change limits in the dashboard, or with an
account key.
