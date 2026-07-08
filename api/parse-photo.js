// POST /api/parse-photo
// Body: { images: [ { data: "<base64>", mediaType: "image/jpeg" }, ... ] }
// Returns: { flights: [ { date, from, to, airline }, ... ] }
// The Anthropic API key lives only here (server side), never in the browser.

const PROMPT = `You extract flights from whatever document or image is provided. It may be a boarding pass, an e-ticket, a booking or check-in confirmation, an airline email, an itinerary, a calendar entry, a spreadsheet, a table, a screenshot, or a multi-page travel report. Read ALL pages and ALL rows.
Return ONLY a JSON array, no prose, no code fences.
Each item must be: {"date":"YYYY-MM-DD","from":"IATA","to":"IATA","airline":"Airline name"}
Rules:
- Extract EVERY distinct flight leg you can find, including every row of any table or list.
- Use 3-letter IATA airport codes. Convert city or airport names to their IATA code (e.g. Beirut -> BEY, Dubai -> DXB, Paris -> CDG). If a city has several airports and it is ambiguous, pick the main one.
- "date" is the departure date. If the year is missing, infer the most likely year from context.
- If a field is unreadable or absent, use null.
- Do not invent flights. If none are present, return [].`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set in Vercel env vars" });

  try {
    const { files, images } = req.body || {};
    const parts = Array.isArray(files) ? files : Array.isArray(images) ? images.map((i) => ({ kind: "image", ...i })) : [];
    if (parts.length === 0) return res.status(400).json({ error: "no files provided" });

    const content = parts.map((p) =>
      p.kind === "document"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: p.data } }
        : { type: "image", source: { type: "base64", media_type: p.mediaType || "image/jpeg", data: p.data } }
    );
    content.push({ type: "text", text: PROMPT });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5", // capable at vision; switch to "claude-haiku-4-5-20251001" for lower cost
        max_tokens: 16000, // plenty of room even for a full multi-page report
        messages: [{ role: "user", content }],
      }),
    });

    const d = await r.json();
    if (!r.ok) return res.status(502).json({ error: "anthropic error", detail: d });

    const text = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const flights = parseFlights(text);
    const out = { flights };
    if (!flights.length) out.sample = text.slice(0, 400); // helps debugging when nothing parses
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

// Resilient: try to parse the whole array; if it is truncated or messy,
// salvage every complete {..} object so we never throw away good rows.
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
  while ((m = re.exec(chunk))) {
    try { objs.push(JSON.parse(m[0])); } catch (_) {}
  }
  return objs;
}
