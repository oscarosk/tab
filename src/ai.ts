import { Item, ruleSplit } from "./bill";

/** Shrinks a photo so it uploads fast (and fits serverless body limits). */
export async function fileToJpegBase64(file: Blob, maxSide = 1400): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface ReceiptResult { merchant?: string; items: { name: string; price: number }[]; tax: number; tip: number }

export async function readReceipt(file: Blob): Promise<ReceiptResult> {
  const image = await fileToJpegBase64(file);
  const r = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "receipt", image, mime: "image/jpeg" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `AI unavailable (${r.status})`);
  return {
    merchant: j.merchant,
    items: (j.items || []).filter((x: any) => x && x.name && Number(x.price) > 0).map((x: any) => ({ name: String(x.name), price: Number(x.price) })),
    tax: Number(j.tax) || 0,
    tip: Number(j.tip) || 0,
  };
}

export async function splitWithAI(text: string, items: Item[], people: string[]): Promise<{ assignments: number[][]; note?: string; source: "ai" | "rules" }> {
  try {
    const r = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "split", text, items: items.map(({ name, price }) => ({ name, price })), people }),
    });
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j.assignments)) {
        const a = items.map((_, i) => (Array.isArray(j.assignments[i]) ? j.assignments[i].filter((n: any) => Number.isInteger(n) && n >= 0 && n < people.length) : []));
        return { assignments: a, note: j.note, source: "ai" };
      }
    }
  } catch { /* fall through */ }
  return { assignments: ruleSplit(text, items, people), source: "rules" };
}
