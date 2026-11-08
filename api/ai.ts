// Vercel serverless function. Two jobs:
//  - "receipt": read a receipt photo → items, tax, tip
//  - "split":   "Sam had the burger and both beers, fries were shared" → who had what
// Set ONE of: GEMINI_API_KEY (free at aistudio.google.com), ANTHROPIC_API_KEY, OPENAI_API_KEY.
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const RECEIPT_PROMPT = `Read this receipt. Return ONLY JSON:
{"merchant": string, "items": [{"name": string, "price": number}], "tax": number, "tip": number}
- One entry per line item; price is the LINE TOTAL (quantity × unit price), in the receipt's currency units.
- Keep quantity in the name, e.g. "Craft Beer x2".
- Do not include subtotal/total/tax/tip/service lines as items. tax = sum of taxes; tip = tip or service charge (0 if none).`;

const SPLIT_PROMPT = (items: { name: string; price: number }[], people: string[], text: string) => `
People at the table (index: name): ${people.map((p, i) => `${i}: ${p}`).join(", ")}
(Index 0 is the person writing; "I", "me", "my" refer to them.)
Items (index: name, price): ${items.map((it, i) => `${i}: ${it.name} ${it.price}`).join("; ")}
What they said: "${text}"

Return ONLY JSON: {"assignments": [[person indexes] for each item, in item order], "note": string}
- An item shared by specific people lists all of them; an item shared by everyone, or not mentioned, is [].
- "both beers" / "the beers" for a quantity line means that whole line.
- note: one short friendly sentence summarizing the split.`;

function extractJson(text: string) {
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

async function callLLM(prompt: string, image?: { mime: string; data: string }): Promise<any> {
  if (process.env.GEMINI_API_KEY) {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const parts: any[] = [{ text: prompt }];
    if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } });
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
      }
    );
    const j: any = await r.json();
    return extractJson(j?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? JSON.stringify(j));
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const content: any[] = [];
    if (image) content.push({ type: "image", source: { type: "base64", media_type: image.mime, data: image.data } });
    content.push({ type: "text", text: prompt });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5", max_tokens: 1500, messages: [{ role: "user", content }] }),
    });
    const j: any = await r.json();
    return extractJson(j?.content?.[0]?.text ?? JSON.stringify(j));
  }
  if (process.env.OPENAI_API_KEY) {
    const content: any[] = [{ type: "text", text: prompt }];
    if (image) content.push({ type: "image_url", image_url: { url: `data:${image.mime};base64,${image.data}` } });
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", response_format: { type: "json_object" }, messages: [{ role: "user", content }] }),
    });
    const j: any = await r.json();
    return extractJson(j?.choices?.[0]?.message?.content ?? JSON.stringify(j));
  }
  throw Object.assign(new Error("No AI key configured"), { status: 501 });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const body = req.body ?? {};
  try {
    if (body.action === "receipt") {
      if (typeof body.image !== "string" || body.image.length > 4_000_000) return res.status(400).json({ error: "bad image" });
      const out = await callLLM(RECEIPT_PROMPT, { mime: body.mime || "image/jpeg", data: body.image });
      if (!out?.items) return res.status(502).json({ error: "Could not read receipt", raw: out });
      return res.status(200).json(out);
    }
    if (body.action === "split") {
      const out = await callLLM(SPLIT_PROMPT(body.items ?? [], body.people ?? [], String(body.text ?? "").slice(0, 1000)));
      if (!Array.isArray(out?.assignments)) return res.status(502).json({ error: "Could not split", raw: out });
      return res.status(200).json(out);
    }
    return res.status(400).json({ error: "unknown action" });
  } catch (e: any) {
    return res.status(e?.status ?? 500).json({ error: String(e?.message ?? e) });
  }
}
