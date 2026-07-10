// POST /api/parse-email
// Body: { emails: [ { subject, from, date, text }, ... ] }
// Returns: { flights: [ { date, from, to, airline }, ... ] }
//
// Cost design: the browser already (a) narrows to likely flight emails with a
// Gmail search query, (b) strips and trims each body, and (c) drops emails with
// no date. This endpoint then reads the WHOLE batch in ONE call using the
// cheapest model (Haiku). One request covers many emails.

const PROMPT = `You are given several traveler emails (booking confirmations, e-tickets, itineraries, boarding passes, check-in reminders). Extract EVERY distinct flight leg across ALL of them.
Return ONLY a JSON array, no prose, no code fences.
Each item must be: {"date":"YYYY-MM-DD","from":"IATA","to":"IATA","airline":"Airline name"}
Rules:
- Use 3-letter IATA airport codes. Convert city or airport names to their IATA code (Beirut -> BEY, Dubai -> DXB, Paris -> CDG). If a city has several airports and it is ambiguous, pick the main one.
- "date" is the departure date. If the year is not explicit, infer it from the email's own date.
- Include return legs and every segment of multi-leg trips.
- Ignore fare sales, promotions, newsletters, loyalty statements and anything that is not an actual booked flight.
- Do NOT invent flights. If an email has no real flight, contribute nothing for it. If none of the emails do, return [].`;

export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set in Vercel env vars" });

  try {
    const { emails } = req.body || {};
    if (!Array.isArray(emails) || emails.length === 0) return res.status(400).json({ error: "no emails provided" });

    // Assemble one compact prompt for the whole batch. Trim each body defensively.
    const blocks = emails.slice(0, 40).map((e, i) => {
      const t = String(e.text || "").slice(0, 1500);
      return `--- EMAIL ${i + 1} ---\nDate: ${e.date || ""}\nFrom: ${e.from || ""}\nSubject: ${e.subject || ""}\n${t}`;
    });
    const userText = PROMPT + "\n\n" + blocks.join("\n\n");

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // cheapest model; extraction is simple structured work
        max_tokens: 4000,
        messages: [{ role: "user", content: userText }],
      }),
    });

    const d = await r.json();
    if (!r.ok) return res.status(502).json({ error: "anthropic error", detail: d });

    const text = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return res.status(200).json({ flights: parseFlights(text) });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

function parseFlights(text) {
  const s = text.indexOf("[");
  if (s === -1) return [];
  const chunk = text.slice(s);
  const end = chunk.lastIndexOf("]");
  if (end !== -1) {
    try { const a = JSON.parse(chunk.slice(0, end + 1)); if (Array.isArray(a)) return a; } catch (_) {}
  }
  const objs = [];
  const re = /\{[^{}]*\}/g;
  let m;
  while ((m = re.exec(chunk))) { try { objs.push(JSON.parse(m[0])); } catch (_) {} }
  return objs;
}
