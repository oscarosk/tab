# Tab: submission kit

## 1. Deploy (about 15 minutes)

1. Unzip `tab.zip`. In a terminal inside the folder: `npm install` then `npm run dev`, and open http://localhost:5173 to check it loads.
2. Put it on GitHub (public repo named `tab`): either `git init && git add . && git commit -m "Tab: MLH Solana Hackathon"` and push, or upload the files on github.com **except** `node_modules` and `dist`.
3. **vercel.com → Add New → Project →** import the repo. Framework: **Vite**. Before deploying, open **Environment Variables** and add `GEMINI_API_KEY` = your key from aistudio.google.com. Then **Deploy**.
4. Set Phantom to devnet on **both** laptop and phone (Settings → Developer Settings → Testnet Mode → Solana Devnet). Get free SOL on both at https://faucet.solana.com.
5. **Full dry run:** open your live URL → "Try a sample receipt" (or snap a real one) → add 2 friends → type who had what → **Split with AI** → "Use my wallet" → **Create tab**. Then on your phone open Phantom → tap the **scan** icon → scan one person's QR → approve. Watch that card flip to ✅ Paid on the laptop. Pay the second one with "Pay from this browser" to see the confetti.
6. Put the live URL at the top of README.md.

**If something breaks:**
- AI errors → check the `GEMINI_API_KEY` name and redeploy. If the model name is rejected, add `GEMINI_MODEL` with a current model name from AI Studio.
- Board not updating → public devnet RPC is rate-limiting. Get a free devnet RPC URL at helius.dev, add it as `VITE_RPC_URL`, and redeploy.
- Phone scan pays on the wrong network → make sure Phantom mobile's Testnet Mode is on and set to Devnet.

## 2. MLH submission text

**Title:** Tab: split the bill, everyone pays from their phone, settled on Solana in seconds

**Tagline:** Snap the receipt, say who had what, and everyone scans and pays their exact share. A live board ticks each person off as their payment lands on Solana. No app to install, no backend, no "I'll send it later."

**Challenges:** Top 3 Overall (automatic), **AI Track**, plus Best Beginner Hack if eligible.

**Description:**

> **The problem.** Splitting a bill is still awkward. Someone pays, someone does the math, and then you chase people for days. Payment apps don't work across countries, banks take days, and card rails make small splits expensive.
>
> **What Tab does.**
> 1. Snap the receipt. AI vision reads every item, the tax and the tip.
> 2. Say who had what in plain English ("Sam had the burger and both beers, fries were shared"). AI assigns the items, and tax + tip are split in proportion to what each person ordered.
> 3. Each friend scans their own QR with a phone wallet and pays their exact share.
> 4. The host's screen flips them to ✅ Paid about a second later, with confetti when the table is settled.
>
> **Why Solana.** Payments settle in about a second for a fraction of a cent, so even an $8 share makes sense, and it works across borders. Tab also has **no backend at all**. Every QR is a Solana Pay transfer request with a unique reference key, and the board finds each payment by looking that key up on-chain, then verifies the amount and recipient. The bill lives in the link and the blockchain is the shared ledger, so nobody can fake "I paid."
>
> **How AI is used.** Receipt understanding (vision → structured line items, tax, tip) and natural-language splitting (a sentence → per-item assignments), with a deterministic fallback so it always works.
>
> **Built with:** React + TypeScript, @solana/web3.js, Solana Pay (reference keys + memos), System and Memo programs, Gemini/Claude/OpenAI via a Vercel function, Phantom.
>
> **What's next.** USDC by default, and local currencies. Then **pay-at-table for restaurants**: the QR is printed on the receipt, guests split and pay themselves, and the restaurant gets paid instantly with network fees of a fraction of a cent instead of ~3% card fees. After that, group tabs for trips and flatmates, and a Solana Mobile app.

## 3. The 2-minute video script

**Setup before recording:** laptop with the app open and Phantom connected (devnet), phone with Phantom (devnet, some SOL), a real receipt or the sample. Record the laptop screen with Loom, and film the phone with a second camera or hold it up to the webcam for the scan moment.

| Time | Show | Say |
|---|---|---|
| 0:00–0:12 | App home | "You've all been here: dinner's over, one person paid, and now it's 'who had what' and 'I'll send it later'. Tab fixes that in under a minute, on Solana." |
| 0:12–0:30 | Snap or upload receipt → items appear | "I snap the receipt. AI reads every line, the tax and the tip. I can fix anything, but it's usually right." |
| 0:30–0:48 | Add Sam, Priya → type the sentence → **Split with AI** → grid fills | "Now I just say who had what: 'Sam had the burger and both beers, I had the pizza, Priya had the lemonade, fries were shared.' The AI assigns everything, and tax and tip are split fairly by what each person ordered." |
| 0:48–1:00 | Use my wallet → **Create tab** → board with QR codes | "Create the tab. Everyone gets their own QR code with their exact share. I drop the link in the group chat." |
| 1:00–1:25 | **Phone scans Sam's QR → approve → laptop flips to ✅ Paid** (keep both in frame) | "Sam scans with Phantom… approves… and there it is. Paid, on my screen, about a second later. It cost a fraction of a cent, and no app to install." |
| 1:25–1:35 | Pay Priya's share → confetti → click Explorer link | "Priya pays, and the table's settled. Every payment is right here on Solana." |
| 1:35–2:00 | README or the board | "Here's the part I love: Tab has no server and no database. Each QR has a unique Solana Pay reference key, so the page finds each payment on-chain by itself, and nobody can fake 'I paid'. Next: USDC by default, and then pay-at-table for restaurants. The QR is printed on the receipt, guests split and pay themselves, and the restaurant gets paid instantly without a 3% card fee. That's Tab." |

**Tips:** do one full dry run first. Zoom the browser to 110–125%. The phone-scan-then-laptop-updates shot is your money moment, so make sure it's clearly in frame. Upload to YouTube as **Unlisted**.
