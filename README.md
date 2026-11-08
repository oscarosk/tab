# 🧾 Tab: split the bill, everyone pays from their phone, settled on Solana in seconds

**Dinner's over. Someone paid. Now comes the awkward part:** "who had what?", "I'll send it later", and three days of reminders.

**Tab fixes it in under a minute:**

1. **Snap the receipt.** AI reads every line item, the tax and the tip.
2. **Say who had what** in plain English: *"Sam had the burger and both beers, I had the pizza, fries were shared."* AI assigns the items, and tax + tip are split fairly in proportion to what each person ordered.
3. **Everyone scans their own QR code** with a phone wallet and pays their exact share. It settles in about a second, for a fraction of a cent.
4. **A live board ticks each person off** as their payment lands on-chain. No "I sent it, I promise."

> Built for the MLH Solana Hackathon (Nov 6–8, 2026) · AI Track · Runs on Solana devnet

**Live demo:** `<your-vercel-url>` · **Video:** `<your-video-url>`

---

## Why Solana, and why it can't just be a web2 app

- **Speed:** a friend scans, and the host's screen updates about a second later, while everyone's still at the table. A bank transfer takes days; a card payment can't be split at all.
- **Cost:** a $8 lemonade share costs ~$0.0005 to send. On card rails, that same small payment loses ~3% plus fixed fees, which kills micro-splits.
- **No backend at all.** Each person's QR is a **Solana Pay** transfer request with a unique **reference key**. The board finds each payment by querying the chain for that key (`getSignaturesForAddress`), then verifies the recipient and amount. The bill itself lives in the link. The blockchain is the shared ledger: there's no server, no database, nothing to hack, and nobody can fake "I paid."
- **Works with any Solana Pay wallet** (Phantom, Solflare, …) and with no app to install. Friends just scan, or open the group-chat link on their phone and tap **Pay with Phantom**.
- **SOL or USDC.** Pay in SOL, or in USDC for exact dollars (SPL `transferChecked`, verified on-chain the same way).

## How it works

```
Receipt photo ──► /api/ai (Gemini / Claude / GPT vision) ──► items, tax, tip
"Sam had the burger…" ──► /api/ai ──► who had what ──► shares (tax+tip pro-rata)
                                          │
Create tab ──► link: #/b/<bill encoded in URL>  (payee, items, people, SOL rate,
                                                  one random reference key per person)
                                          │
Each person: QR = solana:<host>?amount=<share>&reference=<their key>&memo=Tab: <name>
                                          │  scanned with Phantom on a phone
                                          ▼
            Solana transfer (reference key attached as a read-only account)
                                          │
Board polls every 2s: getSignaturesForAddress(reference) → getParsedTransaction
  → verify transfer to host ≥ share → ✅ Paid (with Explorer link) → 🎉 when everyone has paid
```

## Tech

- **Frontend:** React + Vite + TypeScript, `@solana/web3.js`, `qrcode`, `canvas-confetti`
- **Solana:** Solana Pay transfer requests (reference keys + memo), System Program transfers, Memo program, on-chain payment discovery, all on devnet
- **AI:** one Vercel serverless function (`/api/ai`) for receipt vision and natural-language splitting. It works with **Gemini** (`GEMINI_API_KEY`, free tier), **Claude** (`ANTHROPIC_API_KEY`) or **OpenAI** (`OPENAI_API_KEY`), and falls back to a built-in parser so the app works with no key.
- **Verified:** payment transaction executed in a local Solana VM (LiteSVM). The host receives funds, and the reference key is in the transaction's account list so it can be found on-chain.

## Run it

```bash
npm install
npm run dev                 # http://localhost:5173 (built-in parser, no AI)
# full AI locally: npm i -g vercel && vercel dev   (with GEMINI_API_KEY set)
```

**Deploy:** import the repo on Vercel (framework: Vite), add `GEMINI_API_KEY`, and deploy. Optional: `VITE_RPC_URL` for a dedicated devnet RPC (e.g. Helius) if the public one rate-limits.

**Try it:** set Phantom to devnet (Settings → Developer Settings → Testnet Mode → Solana Devnet) and get free SOL at faucet.solana.com. Create a tab with your laptop wallet as the host, then scan a QR with Phantom on your phone.

## Honest limitations (hackathon scope)

- SOL payments use the USD rate captured when the tab is created. Choose **USDC** for exact-dollar payments (Circle's devnet USDC; get some free at faucet.circle.com).
- Anyone with the link can see the bill, by design for group chats. Amounts and names are visible on the page, though payments only show addresses on-chain.

## What's next

1. **USDC by default** (already supported as an option) plus local-currency display (₹, €, £).
2. **Pay-at-table for restaurants.** The same flow, run by the restaurant: the QR prints on the receipt, guests split and pay themselves, and the restaurant is paid instantly, with network fees of a fraction of a cent instead of ~3% card fees. Pay-at-table apps have raised big rounds on card rails; Tab does it on Solana.
3. **Group tabs over time** (trips, flatmates): a running balance that settles in one tap.
4. **Solana Mobile / Seeker app**: snap, split and pay without leaving the phone.
