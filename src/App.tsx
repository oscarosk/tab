import { useEffect, useMemo, useRef, useState } from "react";
import { Keypair } from "@solana/web3.js";
import QRCode from "qrcode";
import confetti from "canvas-confetti";
import {
  Bill, Item, SAMPLE_ITEMS, SAMPLE_TAX, amountFor, billUrl, computeShares, decodeBill, encodeBill, round2,
} from "./bill";
import {
  PaidInfo, explorerAddr, explorerTx, findPayment, getProvider, isAddress, payFromBrowser, short, solUsdRate, solanaPayUrl,
} from "./chain";
import { readReceipt, splitWithAI } from "./ai";

const usd = (n: number) => `$${n.toFixed(2)}`;

export default function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => setHash(location.hash);
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const code = hash.startsWith("#/b/") ? hash.slice(4) : null;
  const bill = useMemo(() => (code ? decodeBill(code) : null), [code]);

  return (
    <div className="app">
      <header>
        <a className="brand" href="#/">
          <span className="logo">🧾</span>
          <div>
            <h1>Tab</h1>
            <p>Snap the receipt. Everyone pays from their phone. Settled on Solana in seconds.</p>
          </div>
        </a>
        <span className="pill">Solana Devnet</span>
      </header>
      {code && !bill && <div className="error">This bill link is broken. <a href="#/">Start a new one</a></div>}
      {bill ? <BillView bill={bill} /> : <CreateView />}
      <footer>
        No server, no database: the bill lives in the link and payments are read straight from Solana. · Built for the MLH Solana Hackathon
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Create a bill                                                       */
/* ------------------------------------------------------------------ */

function CreateView() {
  const [items, setItems] = useState<Item[]>([]);
  const [tax, setTax] = useState(0);
  const [tipPct, setTipPct] = useState(15);
  const [tipFixed, setTipFixed] = useState<number | null>(null);
  const [people, setPeople] = useState<string[]>(["Me"]);
  const [newName, setNewName] = useState("");
  const [splitText, setSplitText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [title, setTitle] = useState("Friday dinner");
  const [payee, setPayee] = useState("");
  const [cur, setCur] = useState<"SOL" | "USDC">("SOL");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const subtotal = round2(items.reduce((a, b) => a + b.price, 0));
  const tip = tipFixed ?? round2((subtotal * tipPct) / 100);
  const shares = computeShares(items, people.length, tax, tip);
  const total = round2(subtotal + tax + tip);

  async function scan(file: Blob, label: string) {
    setError(null); setBusy(`AI is reading ${label}`); setPreview(URL.createObjectURL(file));
    try {
      const r = await readReceipt(file);
      if (!r.items.length) throw new Error("No items found on that receipt");
      setItems(r.items.map((i) => ({ ...i, who: [] })));
      setTax(round2(r.tax));
      setTipFixed(r.tip > 0 ? round2(r.tip) : null);
      if (r.merchant) setTitle(r.merchant);
    } catch (e: any) {
      if (label === "the sample receipt") {
        setItems(SAMPLE_ITEMS.map((i) => ({ ...i, who: [] }))); setTax(SAMPLE_TAX); setTipFixed(null);
        setError(`AI isn't configured yet (${e.message}), so I loaded the sample items directly. Add GEMINI_API_KEY on Vercel to enable receipt reading.`);
      } else setError(e.message);
    } finally { setBusy(null); }
  }

  async function sample() {
    const blob = await (await fetch("/sample-receipt.png")).blob();
    scan(blob, "the sample receipt");
  }

  function addPerson() {
    const n = newName.trim();
    if (!n || people.some((p) => p.toLowerCase() === n.toLowerCase())) return;
    setPeople([...people, n]); setNewName("");
  }
  function removePerson(idx: number) {
    if (idx === 0) return;
    setPeople(people.filter((_, i) => i !== idx));
    setItems(items.map((it) => ({ ...it, who: it.who.filter((w) => w !== idx).map((w) => (w > idx ? w - 1 : w)) })));
  }
  function toggle(itemIdx: number, personIdx: number) {
    setItems(items.map((it, i) => {
      if (i !== itemIdx) return it;
      const base = it.who.length ? it.who : people.map((_, k) => k);
      const next = base.includes(personIdx) ? base.filter((p) => p !== personIdx) : [...base, personIdx].sort();
      return { ...it, who: next.length === people.length ? [] : next };
    }));
  }
  async function aiSplit() {
    if (!splitText.trim() || !items.length) return;
    setBusy("AI is splitting the bill"); setError(null);
    const r = await splitWithAI(splitText, items, people);
    setItems(items.map((it, i) => ({ ...it, who: r.assignments[i] ?? [] })));
    setNote(r.note ?? (r.source === "rules" ? "Split using the built-in parser (add an AI key for smarter splits)." : null));
    setBusy(null);
  }
  async function connectWallet() {
    const p = getProvider();
    if (!p) { window.open("https://phantom.com/download", "_blank"); return; }
    try { const r = await p.connect(); setPayee(r.publicKey.toString()); } catch (e: any) { setError(e.message); }
  }
  async function create() {
    setError(null);
    if (!items.length) return setError("Add the receipt items first.");
    if (people.length < 2) return setError("Add at least one friend to split with.");
    if (!isAddress(payee)) return setError("Connect your wallet (or paste your Solana address) so you get paid.");
    setBusy("Creating your tab");
    const rate = await solUsdRate();
    const bill: Bill = {
      v: 1, title: title.trim() || "Dinner", payee, rate, cur, created: Date.now(), items, tax, tip,
      people: people.map((name, i) => ({ name, usd: shares[i], ref: Keypair.generate().publicKey.toBase58(), host: i === 0 })),
    };
    setBusy(null);
    location.hash = `#/b/${encodeBill(bill)}`;
  }

  return (
    <main className="create">
      <section className="card">
        <h2><span className="num">1</span> The receipt</h2>
        <div className="row">
          <button className="primary" onClick={() => fileRef.current?.click()} disabled={!!busy}>📷 Snap or upload receipt</button>
          <button className="ghost" onClick={sample} disabled={!!busy}>Try a sample receipt</button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) scan(f, "your receipt"); e.target.value = ""; }} />
        </div>
        <div className="receipt-wrap">
          {preview && <img className="receipt-img" src={preview} alt="receipt" />}
          <div className="items">
            {items.length === 0 && <p className="muted">AI reads every line item, tax and tip from a photo. You can edit anything after.</p>}
            {items.map((it, i) => (
              <div className="item-row" key={i}>
                <input value={it.name} onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                <input className="price" type="number" step="0.01" value={it.price}
                  onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, price: Number(e.target.value) } : x)))} />
                <button className="icon" onClick={() => setItems(items.filter((_, k) => k !== i))}>✕</button>
              </div>
            ))}
            <button className="link" onClick={() => setItems([...items, { name: "New item", price: 0, who: [] }])}>+ Add item</button>
            {items.length > 0 && (
              <div className="totals">
                <div><span>Subtotal</span><b>{usd(subtotal)}</b></div>
                <div><span>Tax</span><input className="price" type="number" step="0.01" value={tax} onChange={(e) => setTax(Number(e.target.value))} /></div>
                <div>
                  <span>Tip</span>
                  <span className="tips">
                    {[0, 10, 15, 18, 20].map((p) => (
                      <button key={p} className={`chip ${tipFixed === null && tipPct === p ? "on" : ""}`} onClick={() => { setTipFixed(null); setTipPct(p); }}>{p}%</button>
                    ))}
                    <b>{usd(tip)}</b>
                  </span>
                </div>
                <div className="grand"><span>Total</span><b>{usd(total)}</b></div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        <h2><span className="num">2</span> Who's at the table?</h2>
        <div className="people">
          {people.map((p, i) => (
            <span key={i} className="person">{p}{i === 0 ? " (paid the bill)" : ""}{i > 0 && <button className="icon" onClick={() => removePerson(i)}>✕</button>}</span>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); addPerson(); }} className="add-person">
            <input placeholder="Add a friend…" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="ghost">Add</button>
          </form>
        </div>
      </section>

      <section className="card">
        <h2><span className="num">3</span> Who had what?</h2>
        <div className="row">
          <input className="grow" placeholder={`e.g. "${people[1] ?? "Sam"} had the burger and both beers, I had the pizza, fries were shared"`}
            value={splitText} onChange={(e) => setSplitText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && aiSplit()} />
          <button className="primary" onClick={aiSplit} disabled={!!busy || !items.length}>✨ Split with AI</button>
        </div>
        {note && <p className="note">🤖 {note}</p>}
        {items.length > 0 && people.length > 0 && (
          <div className="grid-wrap">
            <table className="grid">
              <thead>
                <tr><th>Item</th>{people.map((p, i) => <th key={i}>{p}</th>)}</tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.name} <span className="muted">{usd(it.price)}</span>{it.who.length === 0 && <span className="tag">shared</span>}</td>
                    {people.map((_, p) => (
                      <td key={p} className="cell">
                        <input type="checkbox" checked={it.who.length === 0 || it.who.includes(p)} onChange={() => toggle(i, p)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td><b>Owes (incl. tax + tip)</b></td>{shares.map((s, i) => <td key={i}><b>{usd(s)}</b></td>)}</tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2><span className="num">4</span> Get paid</h2>
        <div className="row">
          <input className="grow" placeholder="Name this tab" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="row">
          <input className="grow mono" placeholder="Your Solana address (where friends pay you)" value={payee} onChange={(e) => setPayee(e.target.value.trim())} />
          <button className="ghost" onClick={connectWallet}>Use my wallet</button>
        </div>
        <div className="row cur-row">
          <span className="muted">Friends pay in</span>
          <button className={`chip ${cur === "SOL" ? "on" : ""}`} onClick={() => setCur("SOL")}>SOL</button>
          <button className={`chip ${cur === "USDC" ? "on" : ""}`} onClick={() => setCur("USDC")}>USDC (exact dollars)</button>
          {cur === "USDC" && <span className="muted small">Devnet USDC is free at <a href="https://faucet.circle.com" target="_blank">faucet.circle.com</a> (choose Solana Devnet).</span>}
        </div>
        <button className="primary big" onClick={create} disabled={!!busy}>Create tab & get payment QR codes →</button>
      </section>

      {busy && <div className="toast">⏳ {busy}…</div>}
      {error && <div className="error" onClick={() => setError(null)}>⚠️ {error}</div>}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Live bill board                                                     */
/* ------------------------------------------------------------------ */

function BillView({ bill }: { bill: Bill }) {
  const [paid, setPaid] = useState<Record<string, PaidInfo>>({});
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const celebrated = useRef(false);
  const payers = bill.people.filter((p) => !p.host);
  const paidCount = payers.filter((p) => paid[p.ref]).length;
  const allPaid = payers.length > 0 && paidCount === payers.length;
  const collected = round2(payers.filter((p) => paid[p.ref]).reduce((a, p) => a + p.usd, 0));
  const owed = round2(payers.reduce((a, p) => a + p.usd, 0));

  useEffect(() => {
    let stop = false;
    async function poll() {
      for (const p of payers) {
        if (stop || paid[p.ref]) continue;
        try {
          const r = await findPayment(p.ref, bill.payee, amountFor(bill, p.usd).base, bill.cur ?? "SOL");
          if (r && !stop) setPaid((x) => ({ ...x, [p.ref]: r }));
        } catch { /* rpc hiccup, retry next tick */ }
      }
    }
    poll();
    const t = setInterval(poll, 2000);
    return () => { stop = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill, paidCount]);

  useEffect(() => {
    if (allPaid && !celebrated.current) {
      celebrated.current = true;
      confetti({ particleCount: 160, spread: 90, origin: { y: 0.3 } });
    }
  }, [allPaid]);

  async function copy() {
    await navigator.clipboard.writeText(billUrl(bill));
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="board">
      <section className="card hero">
        <div>
          <div className="muted small">TAB</div>
          <h2 className="title">{bill.title}</h2>
          <div className="muted">
            Total {usd(round2(bill.items.reduce((a, b) => a + b.price, 0) + bill.tax + bill.tip))} · paid to{" "}
            <a className="mono" href={explorerAddr(bill.payee)} target="_blank">{short(bill.payee)}</a> · {bill.cur === "USDC" ? "paid in USDC" : `1 SOL ≈ ${usd(bill.rate)}`}
          </div>
        </div>
        <div className="progress-box">
          <div className="big-num">{usd(collected)} <span>/ {usd(owed)}</span></div>
          <div className="meter"><div style={{ width: `${owed ? (collected / owed) * 100 : 0}%` }} /></div>
          <div className="muted small">{allPaid ? "🎉 Everyone's paid. Settled on Solana." : `${paidCount} of ${payers.length} paid · updates live from the chain`}</div>
          <button className="ghost small-btn" onClick={copy}>{copied ? "Copied!" : "🔗 Copy link for the group chat"}</button>
        </div>
      </section>

      <section className="people-grid">
        {payers.map((p) => (
          <PersonCard key={p.ref} bill={bill} p={p} paid={paid[p.ref]} onPaid={(info) => setPaid((x) => ({ ...x, [p.ref]: info }))} onError={setErr} />
        ))}
      </section>

      {err && <div className="error" onClick={() => setErr(null)}>⚠️ {err}</div>}
      <p className="muted small center">
        Scan a QR code with Phantom (or any Solana Pay wallet) to pay that person's share. Each QR carries a unique reference key,
        so this page finds the payment on-chain by itself. Nobody has to say "I sent it".
      </p>
    </main>
  );
}

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const hasWallet = !!getProvider();

function PersonCard({ bill, p, paid, onPaid, onError }: {
  bill: Bill; p: Bill["people"][number]; paid?: PaidInfo; onPaid: (i: PaidInfo) => void; onError: (e: string) => void;
}) {
  const [qr, setQr] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const amt = amountFor(bill, p.usd);
  const mine = bill.items.filter((it) => it.who.length === 0 || it.who.includes(bill.people.indexOf(p)));
  const memo = `Tab: ${p.name}`.slice(0, 40);
  const url = solanaPayUrl({ payee: bill.payee, amount: amt.ui, cur: bill.cur, ref: p.ref, label: `Tab: ${p.name}`.slice(0, 32), memo });

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: "#0b0d12", light: "#ffffff" } }).then(setQr);
  }, [url]);

  async function payHere() {
    setBusy(true);
    try {
      const sig = await payFromBrowser({ payee: bill.payee, base: amt.base, cur: bill.cur, ref: p.ref, memo });
      onPaid({ sig, from: "", time: Math.floor(Date.now() / 1000) });
    } catch (e: any) { onError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className={`card person-card ${paid ? "paid" : ""}`}>
      <div className="pc-head">
        <div>
          <div className="pc-name">{p.name}</div>
          <div className="pc-amt">{usd(p.usd)} <span className="muted small">{amt.label}</span></div>
        </div>
        <div className={`status ${paid ? "ok" : ""}`}>{paid ? "✅ Paid" : "Waiting…"}</div>
      </div>
      {paid ? (
        <div className="paid-box">
          <div className="check">✓</div>
          <div>Settled on Solana{paid.time ? ` at ${new Date(paid.time * 1000).toLocaleTimeString()}` : ""}</div>
          <a href={explorerTx(paid.sig)} target="_blank">View transaction ↗</a>
        </div>
      ) : (
        <>
          <a href={url} className="qr-link" title="Open in wallet">{qr && <img className="qr" src={qr} alt={`Pay ${p.name}'s share`} />}</a>
          {isMobile && !hasWallet ? (
            <a className="btn-phantom" href={`https://phantom.app/ul/browse/${encodeURIComponent(location.href)}?ref=${encodeURIComponent(location.origin)}`}>
              Pay {usd(p.usd)} with Phantom
            </a>
          ) : (
            <button className="ghost wide" onClick={payHere} disabled={busy}>{busy ? "Waiting for wallet…" : `Pay ${usd(p.usd)} from this ${isMobile ? "wallet" : "browser"}`}</button>
          )}
        </>
      )}
      <details>
        <summary className="muted small">What {p.name} had</summary>
        <ul className="mine">
          {mine.map((it, i) => {
            const n = it.who.length || bill.people.length;
            return <li key={i}><span>{it.name}{n > 1 ? ` (÷${n})` : ""}</span><span>{usd(it.price / n)}</span></li>;
          })}
          <li className="muted"><span>+ share of tax & tip</span><span></span></li>
        </ul>
      </details>
    </div>
  );
}
