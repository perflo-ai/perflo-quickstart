// Individual, example 2 of 3: let Claude decide when to spend.
//
// Run: pnpm individual:02
// Stop before spending: pnpm individual:02 --dry-run
//
// What this shows:
//   The agent decides. You give Claude one tool that costs money, and a job.
//   Claude chooses whether to use it, and what to ask for. You do not write
//   the vendor name, the price, or the request body anywhere.
//
//   This is the whole point of the product. A budget, not an API key.
//
// Needs: ANTHROPIC_API_KEY in .env, on top of PERFLO_AGENT_KEY.
// Cost: bounded below by this file at BUDGET_USD, and bounded on the server by
// your envelope's caps. A few cents of Claude tokens on top.
//
// One thing to understand before you copy this loop. The vendor's answer is
// untrusted text, and we hand it straight back to Claude. A page you paid to
// scrape can contain instructions aimed at your model, telling it to spend
// again. That is not a reason to avoid agents. It is the reason the real cap
// lives on the server and not in this file: BUDGET_USD below is client-side, so
// a hijacked loop would ignore it, while the envelope cap holds regardless.
// Size the envelope so a fully hijacked agent costs you an amount you shrug at.

import Anthropic from "@anthropic-ai/sdk";
import { agentClient, anthropicKey } from "../src/env.js";
import { confirmSpend, heading, step, nextCommand } from "../src/confirm.js";
import { explainAndExit, isCode } from "../src/explain.js";

const perflo = agentClient();
const claude = new Anthropic({ apiKey: anthropicKey() });

// The one tool that can move money. Everything Claude spends goes through here.
const SPEND_TOOL: Anthropic.Tool = {
  name: "run_paid_task",
  description:
    "Pay for live data or a service to get something done. Describe the job in plain " +
    "English and the best vendor is chosen, paid, and the answer returned. Each call " +
    "costs real money, usually a few cents. Use it when you genuinely need outside " +
    "data. Do not use it for something you already know.",
  input_schema: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "The job, in plain English. For example: find the CEO of Stripe.",
      },
    },
    required: ["task"],
  },
};

const JOB =
  "I am writing a briefing on Stripe. Find out who currently runs the company, " +
  "then tell me in one sentence. Use your paid tool if you need live information.";

// Our own ceiling for this run. Once Claude has spent this much, we stop
// answering its tool calls, so the number printed below is one we enforce
// rather than a guess.
const BUDGET_USD = 0.1;

const go = await confirmSpend(
  "let Claude run a job and spend up to the budget below",
  BUDGET_USD.toFixed(2),
);
if (!go) process.exit(0);

try {
  heading("Handing the job to Claude");
  step(`Job: ${JOB}`);
  step("");
  step(`Claude has exactly one paid tool and a $${BUDGET_USD.toFixed(2)} budget.`);
  step("Watch what it decides.");

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: JOB }];
  let spentTotal = 0;

  // Three rounds is plenty for this job. A real agent would loop until done.
  for (let round = 1; round <= 3; round += 1) {
    const response = await claude.messages.create({
      // Claude thinks before answering by default on this model, and max_tokens
      // is a single budget for thinking plus the reply. Setting it too low
      // truncates the answer mid-sentence, so give it room.
      model: "claude-opus-5",
      max_tokens: 16000,
      tools: [SPEND_TOOL],
      messages,
    });

    // Print any text Claude produced this round. We only read text blocks, so
    // thinking blocks are skipped without us having to handle them.
    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        step("");
        step(`Claude: ${block.text.trim()}`);
      }
    }

    if (response.stop_reason !== "tool_use") {
      heading("Done");
      step(`Claude spent $${spentTotal.toFixed(4)} in total.`);
      break;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      const requested = (block.input as { task?: string }).task ?? "";
      step("");
      step(`Claude decided to spend. It asked for: "${requested}"`);

      // Enforce our own ceiling before we call. This is what makes the number
      // we printed true. Note it only binds because WE control this loop.
      if (spentTotal >= BUDGET_USD) {
        step(`  refused by us: $${BUDGET_USD.toFixed(2)} budget already spent.`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: "Refused: your budget for this run is spent. Answer from what you already know.",
        });
        continue;
      }

      try {
        const result = await perflo.task(requested);
        const charged = Number(result.charged?.amount ?? "0");
        spentTotal += charged;

        step(`  vendor:  ${result.slug ?? "none"}`);
        step(`  charged: $${result.charged?.amount ?? "0.00"}`);

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result.output ?? {}).slice(0, 4000),
        });
      } catch (error) {
        // A refusal is not a crash. Hand the reason back and let Claude adapt.
        // This is how an agent learns it has run out of budget.
        if (isCode(error, "GUARDRAIL_DENIED") || isCode(error, "INSUFFICIENT_BALANCE")) {
          step(`  refused: ${error.code}. Nothing was charged.`);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `Refused: ${error.code}. You have no budget left. Answer from what you already know.`,
          });
        } else {
          throw error;
        }
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  nextCommand(
    "pnpm individual:03",
    "Now put a cap on it and watch the same agent get refused.",
  );
} catch (error) {
  explainAndExit(error);
}
