# Security

## Reporting a problem

Found a vulnerability in this sample repo or in the API behind it? Please report
it privately rather than opening a public issue. Ask your Perflo contact for the
current security address.

Please include the `requestId` from any relevant response. It identifies the
exact request on our side.

## What this repo does to keep you safe

- No full key is ever printed or logged. Only the id and the last four
  characters, which is what those fields exist for.
- `src/explain.ts` redacts anything that looks like a key before printing an
  error.
- `src/env.ts` refuses a non-https base URL, and refuses a key pasted into the
  wrong slot, before any request leaves your machine.
- The files that hold secrets are written owner-only and are covered by
  `.gitignore`, `.dockerignore` and `.npmignore`.
- The optional inspector listens on 127.0.0.1 only, checks the `Host` header,
  and escapes everything it renders.

## Things to change before you copy this into production

1. **`.tenants.json` is demo storage.** `builder/01` writes live spending keys
   to it in plaintext. Use your existing secret store instead, encrypted, keyed
   by the customer. Run `pnpm builder:05` to clean up the demo keys.
2. **The inspector has no authentication.** If you build a real dashboard from
   it, add auth **before** you add any route that writes. An unauthenticated
   write route next to an account key is a remote money mover.
3. **Treat every value the API returns as untrusted text when you render it.**
   Customer labels and vendor names come back as you stored them, and a customer
   who names themselves with an HTML tag must not be able to run script in your
   dashboard.
4. **Treat vendor output as untrusted input to your model.** See the note on
   `individual/02` in `individual/README.md`.
5. **Set an allowlist before you hand out agent keys.** `allowedRecipients` on
   the account spending policy. Without it, transfers can go to any address.
6. **Use `--frozen-lockfile` in CI**, and never put a live key in CI.

## Rotation and incident response

See `docs/credentials.md`. The short version: mint, deploy, verify, then revoke.
And on a leak, zero the envelope's caps first, because that stops every key on
it in one call.
