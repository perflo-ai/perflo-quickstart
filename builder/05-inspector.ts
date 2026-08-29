// Builder, example 5 of 6: watch charges land.
//
// Run: pnpm builder:05    then open http://localhost:4402
//
// Optional, and the only example here that is a server rather than a script.
// It stays running until you stop it with Ctrl+C, so run an earlier example in
// a second terminal and watch the charge appear.
//
// It shows your spendable balance, this month broken down by customer, and the
// most recent charges. It refreshes every three seconds.
//
// This is not part of any integration. It exists because watching a charge
// appear makes the idea concrete in a way reading a JSON response does not.
//
// Cost: nothing. It only reads.
//
// Two things here are worth copying.
//
// First, the key stays on the server. The browser calls this server, and this
// server calls Perflo. Never put a spending key or an account key in frontend
// code, because anything in a browser is public, including a bundled
// environment variable.
//
// Second, this server has no login, so it is locked down two ways: it listens
// on 127.0.0.1 only, and it checks the Host header. You need both. Listening on
// localhost alone still lets any website you visit point a hostname at
// 127.0.0.1 and read this data from your browser.
//
// Everything rendered into the page is escaped. Customer labels and vendor
// names come back from the API as text you did not write, and a customer who
// names themselves with an HTML tag must not be able to run script here.

import { createServer } from "node:http";
import { accountClient } from "../src/env.js";
import { PerfloError } from "../src/perflo.js";

const perflo = accountClient();
const PORT = 4402;

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Perflo inspector</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
         margin: 0; padding: 2rem; max-width: 60rem; }
  h1 { font-size: 1.1rem; margin: 0 0 .25rem; }
  p.sub { margin: 0 0 2rem; opacity: .7; }
  section { margin-bottom: 2rem; }
  h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .08em;
       opacity: .6; margin: 0 0 .75rem; }
  table { border-collapse: collapse; width: 100%; }
  td, th { text-align: left; padding: .35rem .75rem .35rem 0;
           border-bottom: 1px solid rgba(128,128,128,.25); }
  th { font-weight: 600; opacity: .6; font-size: .75rem; text-transform: uppercase; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .out { color: #c0392b; }
  .big { font-size: 1.8rem; font-variant-numeric: tabular-nums; }
  .err { padding: 1rem; border: 1px solid #c0392b; border-radius: 4px; }
</style>
</head>
<body>
  <h1>Perflo inspector</h1>
  <p class="sub">Refreshes every 3 seconds. Run an example in another terminal and watch.</p>
  <div id="root">Loading.</div>
<script>
// Escape everything before it reaches innerHTML. The values below are API
// responses, and a customer label is chosen by your customer.
const esc = v => String(v ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const money = v => v ? "$" + Number(v.amount).toFixed(4) : "-";

async function tick() {
  const root = document.getElementById("root");
  try {
    const res = await fetch("/api/state");
    const s = await res.json();
    if (s.error) { root.innerHTML = '<div class="err">' + esc(s.error) + "</div>"; return; }

    root.innerHTML = [
      '<section><h2>Spendable</h2><div class="big">' + money(s.balance.spendable) + "</div></section>",
      '<section><h2>By customer, ' + esc(s.statement.period) + "</h2>" + table(
        ["Customer", "Calls", "Charged"],
        s.statement.bySubAccount.map(r => [esc(r.subAccount || "unattributed"), r.calls, money(r.charged)])
      ) + "</section>",
      '<section><h2>Latest charges</h2>' + table(
        ["When", "Customer", "Vendor", "State", "Amount"],
        s.transactions.map(r => [
          esc(new Date(r.createdAt).toLocaleTimeString()),
          esc(r.subAccount || "-"), esc(r.slug || "-"), esc(r.ledgerState),
          '<span class="out">' + money(r.amount) + "</span>"
        ])
      ) + "</section>"
    ].join("");
  } catch (e) {
    root.innerHTML = '<div class="err">Cannot reach the inspector server.</div>';
  }
}

function table(head, rows) {
  if (!rows.length) return "<p>Nothing yet.</p>";
  const th = head.map((h, i) => '<th class="' + (i ? "num" : "") + '">' + h + "</th>").join("");
  const tr = rows.map(r => "<tr>" + r.map((c, i) =>
    '<td class="' + (i ? "num" : "") + '">' + c + "</td>").join("") + "</tr>").join("");
  return "<table><thead><tr>" + th + "</tr></thead><tbody>" + tr + "</tbody></table>";
}

tick(); setInterval(tick, 3000);
</script>
</body>
</html>`;

// Only these Host values are served. Without this check, a website you visit
// could point a hostname at 127.0.0.1 and read your balance from your browser.
const ALLOWED_HOSTS = new Set([
  `localhost:${PORT}`,
  `127.0.0.1:${PORT}`,
  `[::1]:${PORT}`,
]);

createServer(async (req, res) => {
  if (!ALLOWED_HOSTS.has(req.headers.host ?? "")) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("Forbidden. Open this page at http://localhost:4402\n");
    return;
  }

  if (req.url === "/api/state") {
    try {
      // Three reads, in parallel. All free.
      const [balance, statement, transactions] = await Promise.all([
        perflo.balance(),
        perflo.statement(),
        perflo.transactions({ limit: 15 }),
      ]);
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ balance, statement, transactions }));
    } catch (error) {
      const message =
        error instanceof PerfloError
          ? `${error.code}: ${error.message}`
          : "Unknown failure reading from the API.";
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "x-content-type-options": "nosniff",
    "content-security-policy":
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
  });
  res.end(PAGE);
}).listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log(`  Inspector running at http://localhost:${PORT}`);
  console.log("  Listening on 127.0.0.1 only. There is no login, so do not");
  console.log("  expose this port to a network.");
  console.log("  Run an example in another terminal and watch the charges land.");
  console.log("  Press Ctrl+C to stop.");
  console.log("");
});
