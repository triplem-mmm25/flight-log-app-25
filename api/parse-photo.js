// POST /api/parse-photo
// Body: { images: [ { data: "<base64>", mediaType: "image/jpeg" }, ... ] }
// Returns: { flights: [ { date, from, to, airline }, ... ] }
// The Anthropic API key lives only here (server side), never in the browser.

const PROMPT = `You are reading boarding passes, flight tickets, itinerary screenshots, or PDF documents.
Extract EVERY distinct flight you can see across all files and all pages.
Return ONLY a JSON array, no prose, no code fences.
Each item must be: {"date":"YYYY-MM-DD","from":"IATA","to":"IATA","airline":"Airline name"}
Rules:
- Use 3-letter IATA airport codes. Convert city or airport names to their IATA code (e.g. Beirut -> BEY, Dubai -> DXB).
- "date" is the departure date. If the year is missing, infer the most likely recent year.
- If a field is unreadable, use null.
- Do not invent flights. If none are visible, return [].`;

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
        max_tokens: 1500,
        messages: [{ role: "user", content }],
      }),
    });

    const d = await r.json();
    if (!r.ok) return res.status(502).json({ error: "anthropic error", detail: d });

    const text = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const s = text.indexOf("["), e = text.lastIndexOf("]");
    let flights = [];
    if (s !== -1 && e !== -1) {
      try { flights = JSON.parse(text.slice(s, e + 1)); } catch (_) {}
    }
    return res.status(200).json({ flights });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
