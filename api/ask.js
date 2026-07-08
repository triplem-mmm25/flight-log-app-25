// POST /api/ask
// Body: { question: "...", flights: [ {date, from, to, airline}, ... ] }
// Returns: { answer: "..." }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set in Vercel env vars" });

  try {
    const { question, flights } = req.body || {};
    if (!question) return res.status(400).json({ error: "no question" });

    const sys =
      "You answer questions about the user's personal flight history using ONLY the data provided. " +
      "Be concise (1 to 3 sentences), specific, and use exact numbers. If it cannot be answered from the data, say so. Do not use em dashes.";

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 800,
        system: sys,
        messages: [
          { role: "user", content: "DATA: " + JSON.stringify(flights || []) + "\n\nQUESTION: " + question },
        ],
      }),
    });

    const d = await r.json();
    if (!r.ok) return res.status(502).json({ error: "anthropic error", detail: d });
    const answer = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    return res.status(200).json({ answer });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
