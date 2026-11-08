// A bill lives entirely in the URL. No server, no database.
// Payments are matched on-chain via a per-person Solana Pay reference key.

export interface Item { name: string; price: number; who: number[] } // who = person indexes; [] = shared by everyone
export interface Person { name: string; ref: string; usd: number; host?: boolean }
export interface Bill {
  v: 1;
  title: string;
  payee: string;        // address that receives the money (the host)
  rate: number;         // USD per SOL at creation time
  cur?: "SOL" | "USDC"; // what friends pay in (default SOL)
  created: number;
  items: Item[];
  tax: number;
  tip: number;
  people: Person[];
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Split items among people; tax + tip are shared in proportion to what each person ordered. */
export function computeShares(items: Item[], peopleCount: number, tax: number, tip: number): number[] {
  const subs = new Array(peopleCount).fill(0);
  for (const it of items) {
    const who = it.who.length ? it.who.filter((i) => i < peopleCount) : [...Array(peopleCount).keys()];
    if (!who.length) continue;
    for (const i of who) subs[i] += it.price / who.length;
  }
  const subtotal = subs.reduce((a, b) => a + b, 0);
  const extras = tax + tip;
  return subs.map((s) => round2(s + (subtotal > 0 ? (extras * s) / subtotal : extras / peopleCount)));
}

function b64urlEncode(s: string) {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string) {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return decodeURIComponent(escape(atob(pad)));
}
export const encodeBill = (b: Bill) => b64urlEncode(JSON.stringify(b));
export function decodeBill(code: string): Bill | null {
  try {
    const b = JSON.parse(b64urlDecode(code));
    return b && b.v === 1 ? b : null;
  } catch {
    return null;
  }
}
export const billUrl = (b: Bill) => `${location.origin}${location.pathname}#/b/${encodeBill(b)}`;

export const lamportsFor = (usd: number, rate: number) => Math.round((usd / rate) * 1e9);
/** Amount in the bill's currency: base units (lamports or USDC micro-units) + display string for Solana Pay. */
export function amountFor(bill: Bill, usd: number): { base: number; ui: string; label: string } {
  if (bill.cur === "USDC") return { base: Math.round(usd * 1e6), ui: usd.toFixed(2), label: `${usd.toFixed(2)} USDC` };
  const base = lamportsFor(usd, bill.rate);
  const ui = (base / 1e9).toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
  return { base, ui, label: `≈ ${Number(ui).toFixed(4)} SOL` };
}
export const solString = (lamports: number) => (lamports / 1e9).toFixed(9).replace(/0+$/, "").replace(/\.$/, "");

/** Deterministic fallback when no AI key is configured: "Sam had the burger and beers; fries shared". */
export function ruleSplit(text: string, items: Item[], names: string[]): number[][] {
  const out: number[][] = items.map(() => []);
  const clauses = text.toLowerCase().split(/[.;,\n]/);
  const stem = (w: string) => w.replace(/(es|s)$/, "");
  let last: number[] = [];
  for (const clause of clauses) {
    let people = names
      .map((n, i) => ({ n: n.toLowerCase(), i }))
      .filter(({ n, i }) => clause.includes(n) || (i === 0 && /\b(i|me|my)\b/.test(clause)))
      .map(({ i }) => i);
    const shared = /\b(shared|split|everyone|all of us|together)\b/.test(clause);
    if (!people.length && !shared) people = last; // "…and both beers" continues the previous person
    if (people.length) last = people;
    const words = new Set(clause.split(/[^a-z0-9]+/).filter((w) => w.length >= 3).map(stem));
    items.forEach((it, idx) => {
      const iw = it.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3).map(stem);
      if (iw.some((w) => words.has(w))) {
        if (shared && people.length < 2) out[idx] = [];
        else if (people.length) out[idx] = Array.from(new Set([...out[idx], ...people]));
      }
    });
  }
  return out;
}

export const SAMPLE_ITEMS: Item[] = [
  { name: "Margherita Pizza", price: 14.0, who: [] },
  { name: "Smash Burger", price: 12.5, who: [] },
  { name: "Truffle Fries", price: 6.0, who: [] },
  { name: "Craft Beer x2", price: 13.0, who: [] },
  { name: "Lemonade", price: 4.5, who: [] },
];
export const SAMPLE_TAX = 4.0;
