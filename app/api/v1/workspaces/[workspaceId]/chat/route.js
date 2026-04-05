import { requireApiWorkspaceSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

function buildSystemPrompt(workspaceName, dashboard) {
  const state = dashboard?.state_summary || {};
  const portfolio = dashboard?.modules?.portfolio || null;
  const holdings = portfolio?.holdings || [];
  const balanceSheet = dashboard?.recoverability_balance_sheet || {};
  const alerts = dashboard?.decision_workspace?.alerts || dashboard?.alerts || [];
  const primaryAction = dashboard?.primary_action || null;
  const escrow = dashboard?.escrow || {};
  const memory = dashboard?.memory || {};
  const evidenceDrawer = dashboard?.evidence_drawer || {};

  const holdingsSummary = holdings.length
    ? holdings
        .slice(0, 20)
        .map((h) => {
          const ticker = h.ticker || h.symbol || "?";
          const weight = h.weight != null ? `${(Number(h.weight) * 100).toFixed(1)}%` : "?%";
          const sector = h.sector ? ` (${h.sector})` : "";
          return `${ticker} ${weight}${sector}`;
        })
        .join(", ")
    : "No holdings recorded yet.";

  const alertsSummary = alerts.length
    ? alerts.map((a) => `[${a.severity?.toUpperCase() || "INFO"}] ${a.title}: ${a.body}`).join("\n")
    : "No active alerts.";

  const primaryActionSummary = primaryAction
    ? `${primaryAction.title || primaryAction.ticker || "Move"} — ${primaryAction.summary || primaryAction.slot || ""}`
    : "No primary action flagged right now.";

  const escrowed = (escrow.items || []).map((e) => e.title || e.summary).filter(Boolean).join(", ");

  return `You are a calm, clear-headed portfolio advisor embedded inside "${workspaceName}", a private investment workspace. Your job is to help the user understand their own portfolio, interpret the workspace metrics, and think through decisions — in plain, jargon-free English.

You have access to the user's live portfolio data below. Use it to ground every answer. When you don't know something precisely, say so — never invent numbers. Always relate your answers back to their specific situation.

== CURRENT WORKSPACE STATE ==
Stance: ${state.stance || "Not set"}
Decision summary: ${state.decisionSummary || "None"}
Market mode: ${state.mode || "-"}
Recovery outlook: ${state.recovery || "-"}
Evidence strength: ${state.evidenceStrength || "-"}
Main risk: ${state.mainRisk || "-"}

== PORTFOLIO HOLDINGS ==
${holdingsSummary}
Total holdings tracked: ${portfolio?.analytics?.holdingsCount || holdings.length}
Largest concentration: ${portfolio?.analytics?.topConcentration || "-"}

== RECOVERABILITY BALANCE SHEET ==
Net freedom: ${balanceSheet.netFreedom ?? "-"}
Recoverability: ${balanceSheet.recoverability ?? "-"}
Optionality reserve: ${balanceSheet.optionalityReserve ?? "-"}
Legitimacy slack: ${balanceSheet.legitimacySlack ?? "-"}
Phantom tax: ${balanceSheet.phantomTax ?? "-"}

== ACTIVE ALERTS ==
${alertsSummary}

== PRIMARY SUGGESTED ACTION ==
${primaryActionSummary}

== STAGED MOVES (ESCROW) ==
${escrowed || "Nothing staged yet."}

== WEEKLY BRIEF ==
${memory?.weeklyBrief?.[0] || evidenceDrawer?.headline || "No brief available."}

== EVIDENCE NOTES ==
${(evidenceDrawer?.currentRead || []).slice(0, 3).join(" | ") || "None."}

== INSTRUCTIONS ==
- Answer in plain English. The user may not be a finance professional.
- Ground every answer in the portfolio data above. Reference specific holdings, metrics, or alerts when relevant.
- Explain any financial term you use in parentheses immediately after using it.
- If the user asks about a position not in their holdings, say you don't see it in their current workspace.
- Keep answers focused and actionable. Avoid generic advice; make it specific to their situation.
- If the workspace lacks data to answer confidently, say what you can see and what you'd need to be more precise.
- Never recommend specific trades or give regulated financial advice. Frame everything as "here is how to think about it" rather than "you should do X".`;
}

export async function POST(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured. Add it to your .env file to enable portfolio chat." },
      { status: 503 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { message, history = [], dashboard = {} } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "Message is required." }, { status: 400 });
  }

  const workspaceName =
    dashboard?.workspace_summary?.name ||
    auth?.workspace?.name ||
    "Allocator Workspace";

  const systemPrompt = buildSystemPrompt(workspaceName, dashboard);

  // Build message array: system + history (capped at last 12) + new user message
  const safeHistory = Array.isArray(history) ? history.slice(-12) : [];
  const messages = [
    { role: "system", content: systemPrompt },
    ...safeHistory.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || ""),
    })),
    { role: "user", content: message.trim() },
  ];

  let openaiResponse;
  try {
    openaiResponse = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: true,
        max_tokens: 600,
        temperature: 0.4,
      }),
    });
  } catch (fetchError) {
    return Response.json(
      { error: "Could not reach OpenAI. Check your internet connection." },
      { status: 502 },
    );
  }

  if (!openaiResponse.ok) {
    const errText = await openaiResponse.text().catch(() => "");
    const status = openaiResponse.status;
    if (status === 401) {
      return Response.json({ error: "Invalid OPENAI_API_KEY. Check your .env file." }, { status: 401 });
    }
    if (status === 429) {
      return Response.json({ error: "OpenAI rate limit reached. Try again in a moment." }, { status: 429 });
    }
    return Response.json({ error: `OpenAI error ${status}: ${errText.slice(0, 200)}` }, { status: 502 });
  }

  // Pipe the OpenAI SSE stream straight through as text/event-stream
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = openaiResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop(); // keep incomplete line

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;
            if (!trimmed.startsWith("data: ")) continue;

            try {
              const json = JSON.parse(trimmed.slice(6));
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (streamError) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: "Stream interrupted." })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
