# Credentials

There are two kinds of key. Picking the wrong one is the most common integration
mistake, and the error messages are written to tell you which way you got it
wrong.

## Telling them apart

The prefix says both which kind of key it is and which environment issued it:

| Prefix | Kind | Environment |
|---|---|---|
| `perflo_live_` | agent | production |
| `perflo_test_` | agent | everywhere else |
| `perflo_admin_live_` | account | production |
| `perflo_admin_test_` | account | everywhere else |

You do not pick `live` or `test`. The environment decides. Against production you
get `live` keys and they move real money.

Holding a key and unsure? Call `GET /v1/key` and read `scope`. An agent key
answers. An account key gets a 401 pointing at `GET /v1/sub-accounts/{id}`.

## Agent key

**What it does:** pays vendors.

It is locked to exactly one spending envelope at the moment it is created. That
lock is stored on our side, not in your request, so it cannot be changed later
and nothing you send can override it.

**It can:**

- Pay a vendor: `POST /v1/pay/{slug}`
- Run a job end to end: `POST /v1/tasks`
- Send money to an address: `POST /v1/transfers`. See the warning below.
- Read its own envelope: `GET /v1/key`, `GET /v1/sub-accounts`
- Read its own history: `GET /v1/transactions`
- Read the **account's** spending policy: `GET /v1/spending-policy`. This one is
  account-wide, not envelope-scoped, so it is more than the key's own view.
- Search and read vendor details, for free
- Trip a kill switch. See the warning below.

**It cannot:**

- Create or revoke any key. You get `403 KEY_CANNOT_MINT`.
- Change any limit, its own included.
- Read the account balance or the account statement. You get
  `403 ACCOUNT_KEY_REQUIRED`.
- Spend from another envelope. You get `403 KEY_SUB_ACCOUNT_MISMATCH`.

### Two things an agent key can do that are wider than you would expect

**1. Transfers are not restricted to a pre-approved address by default.**
`POST /v1/transfers` takes a `recipient` address directly. There is no
registration step. An address allowlist exists, but it is **off unless you set
it**: put `allowedRecipients` on the account's spending policy. Until you do, a
holder of any agent key can send to any address, bounded only by your caps.

If you hand agent keys to customers, set that allowlist.

**2. The kill switches are account-scoped, not envelope-scoped.**
`DELETE /v1/spending-policy` is open to every credential, deliberately, so a
compromised agent can always stop spending. But it revokes **every** matching
policy row on the account, not just the caller's. The response tells you:
`policiesRevoked` is often more than one.

In a builder integration that means one customer's agent key can stop spending
for **all** your customers. It cannot spend their money, and it can halt them.
Envelope isolation does not cover this. Treat every agent key you hand out as
able to cause an outage, and revoke a leaked one promptly.

**Where an agent key belongs:** with the agent that spends. For a builder, one
per customer.

### Why it cannot read the balance

The balance is one number for the whole account. Under a builder integration,
telling one customer's agent the account total would be telling it your pooled
figure, which is the wrong answer by orders of magnitude and none of that
customer's business.

`GET /v1/key` is the replacement. It takes no input, because the key already
names its envelope, so there is nothing you can pass wrongly.

## Account key

**What it does:** provisions and reads. It cannot pay a vendor.

You have exactly one account key at a time. Create it in the dashboard.

**It can:**

- Create, update and switch off envelopes: `/v1/sub-accounts`
- Create and revoke agent keys: `/v1/keys`
- Read and set the account spending policy: `/v1/spending-policy`
- Read the account balance: `GET /v1/balance`
- Read every transaction, including per customer: `GET /v1/transactions`
- Read the monthly statement: `GET /v1/statement`
- Read purchased resources: `GET /v1/resources`
- Search and read vendor details, for free

**It cannot:**

- Pay a vendor. You get `403 ACCOUNT_KEY_CANNOT_SPEND`.
- Create or revoke an account key, its own included. A credential that could
  mint its own replacement would do it the moment it was stolen. Rotation is a
  dashboard action, where a person is present.
- Turn on the on-chain permission that funds spending. A person signs that in
  the dashboard. Nothing in this repo needs it, and you never handle a key or
  an address to make it work.

### An account key is a root credential

It cannot pay a vendor directly. Do not read that as "safe if it leaks."

In two documented calls it can spend your balance:

1. `PATCH /v1/sub-accounts/{id}` to raise a limit, or `POST /v1/sub-accounts`
   with no limits at all, which creates an uncapped envelope.
2. `POST /v1/keys` to mint an agent key inside it.

So protect it exactly as you would a root credential: secret store only, never
in a log, never in an image layer, never in CI output.

**Where it belongs:** on your server, in your secret store. Nowhere else.

## The rule behind all of it

**Nothing that can spend is allowed to widen its own budget.**

Once you have that sentence, the rest of the API's shape follows. An agent
spends inside an envelope. It does not get to move the envelope's walls.

## Both kinds are shown once

We store a hash of the key and its last four characters. Nothing can hand a key
back to you, including us.

That is why `builder/01` writes what it minted to a file. Read it once, store it
properly, and never rely on being able to read it again.

## Rotating a key

Order matters, because revocation takes effect on the **very next request** with
no grace window. Revoking first is an outage.

1. Mint the new key.
2. Deploy it.
3. Verify the agent is actually using it. `GET /v1/keys` shows `lastFour` so you
   can confirm which one is live.
4. Only then revoke the old one: `DELETE /v1/keys/{id}`.

For the account key there is no overlap available: you hold exactly one, and it
cannot revoke itself. Rotation is a dashboard action, so plan for a short window
where provisioning is unavailable, and do it when nobody is mid-onboarding.

## If a key leaks

**An agent key.** In this order:

1. **Stop the bleeding first.** `PATCH /v1/sub-accounts/{id}` with
   `{"limits":{"hourly":{"amount":"0.00","currency":"USD"}}}`. One call, and it
   stops **every** key on that envelope, including any you have not enumerated
   yet. This is faster and broader than revoking keys one at a time.
2. Revoke the key: `DELETE /v1/keys/{id}`. List them with `GET /v1/keys` first
   if you are not sure which.
3. Size the loss:
   `GET /v1/transactions?subAccount={label}&from={iso}&to={iso}`.
4. Mint a replacement and deploy it.
5. Restore the envelope's real caps.

**The account key.** You cannot revoke it through the API by design, so this one
needs the dashboard. Before you get there, limit the damage with what you have:
zero the caps on your envelopes, and check `GET /v1/keys` for any agent key you
did not create. Then rotate the account key in the dashboard.

## Least privilege beyond the two kinds

Two more controls exist and are worth using. Neither is demonstrated in this
repo, and both narrow blast radius more than a dollar cap alone:

- **Per-category limits.** An envelope can cap or block individual capabilities,
  not just total spend. Pass `capabilityLimits` on `POST /v1/sub-accounts`, with
  `allowed: false` to block a category outright. An envelope that can only run
  web searches is a much smaller problem than one that can call anything at the
  same dollar limit.
- **A recipient allowlist.** `allowedRecipients` on the account spending policy,
  as described above. Set it before you hand out any agent key.

## Logging

Log these: the key **id**, its **lastFour**, and the **requestId** from any
response. `POST /v1/keys` returns the first two precisely so you have something
safe to record.

Never log: the key itself, the `Authorization` header, or an unscrubbed error
`details` object. `src/explain.ts` redacts anything that looks like a key before
printing, and that is a habit worth copying rather than a nicety.
