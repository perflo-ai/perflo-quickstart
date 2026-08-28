# Inspector

Optional. A small page that shows charges as they land.

```bash
pnpm inspector
```

Then open http://localhost:4402 and run an example in another terminal.

It shows your spendable balance, this month broken down by customer, and the
most recent charges. It refreshes every three seconds.

This is not part of any integration. It exists because watching a charge appear
makes the idea concrete in a way that reading a JSON response does not.

## The one thing here worth copying

The key stays on the server. Your browser calls this small server, and this
server calls the API.

Never put a spending key or an account key in frontend code. Anything in a
browser is public, including values in a bundled environment variable.

Needs `PERFLO_ACCOUNT_KEY`, because reading the balance and the statement are
account level views.
