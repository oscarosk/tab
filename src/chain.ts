import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

/** Circle's official devnet USDC (free at https://faucet.circle.com → Solana Devnet). */
export const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
export type Cur = "SOL" | "USDC";

const RPC = (import.meta as any).env?.VITE_RPC_URL || clusterApiUrl("devnet");
export const connection = new Connection(RPC, "confirmed");
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
export const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function isAddress(s: string) {
  try { new PublicKey(s); return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s); } catch { return false; }
}

export interface WalletProvider {
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}
export function getProvider(): WalletProvider | null {
  const w = window as any;
  return w.phantom?.solana ?? w.solflare ?? w.backpack ?? w.solana ?? null;
}

/** Solana Pay transfer-request URL: any Solana Pay wallet (Phantom mobile, Solflare…) can scan it. */
export function solanaPayUrl(o: { payee: string; amount: string; ref: string; label: string; memo: string; cur?: Cur }) {
  const params: Record<string, string> = { amount: o.amount };
  if (o.cur === "USDC") params["spl-token"] = USDC_MINT.toBase58();
  Object.assign(params, { reference: o.ref, label: o.label, memo: o.memo });
  const q = new URLSearchParams(params);
  return `solana:${o.payee}?${q.toString().replace(/\+/g, "%20")}`;
}

/** Same payment as the QR, but signed with the browser wallet. */
export async function payFromBrowser(o: { payee: string; base: number; ref: string; memo: string; cur?: Cur }) {
  const provider = getProvider();
  if (!provider) { window.open("https://phantom.com/download", "_blank"); throw new Error("No Solana wallet found. Install Phantom."); }
  const { publicKey } = await provider.connect();
  const payer = new PublicKey(publicKey.toString());
  const payee = new PublicKey(o.payee);
  const ixs: TransactionInstruction[] = [];
  let pay: TransactionInstruction;
  if (o.cur === "USDC") {
    const fromAta = getAssociatedTokenAddressSync(USDC_MINT, payer);
    const toAta = getAssociatedTokenAddressSync(USDC_MINT, payee, true);
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(payer, toAta, payee, USDC_MINT));
    pay = createTransferCheckedInstruction(fromAta, USDC_MINT, toAta, payer, BigInt(o.base), 6);
  } else {
    pay = SystemProgram.transfer({ fromPubkey: payer, toPubkey: payee, lamports: o.base });
  }
  // Solana Pay convention: the reference key is attached as a read-only, non-signer account.
  pay.keys.push({ pubkey: new PublicKey(o.ref), isSigner: false, isWritable: false });
  ixs.push(pay, new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(o.memo, "utf8") }));
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: payer, blockhash, lastValidBlockHeight }).add(...ixs);
  const signed = await provider.signTransaction(tx);
  const raw = signed.serialize();
  // The wallet already simulated it before signing. Skipping preflight avoids "Blockhash not found"
  // when the public devnet RPC is a few slots behind; we rebroadcast until it confirms or expires.
  const sig = await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 5 });
  let done = false;
  const rebroadcast = (async () => {
    while (!done) {
      await new Promise((r) => setTimeout(r, 2000));
      if (!done) connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => {});
    }
  })();
  try {
    const conf = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (conf.value.err) throw new Error("The payment failed on-chain: " + JSON.stringify(conf.value.err) + ". Check the wallet has enough devnet SOL/USDC.");
    return sig;
  } catch (e: any) {
    if (/block height exceeded|expired/i.test(String(e?.message))) throw new Error("The payment expired before it went through. Tap Pay again and approve within about a minute.");
    throw e;
  } finally {
    done = true;
    void rebroadcast;
  }
}

export interface PaidInfo { sig: string; from: string; time: number | null }

/** Finds a confirmed payment for this person's reference key that pays the host at least the expected amount. */
export async function findPayment(ref: string, payee: string, base: number, cur: Cur = "SOL"): Promise<PaidInfo | null> {
  const sigs = await connection.getSignaturesForAddress(new PublicKey(ref), { limit: 10 }, "confirmed");
  const payeeAta = cur === "USDC" ? getAssociatedTokenAddressSync(USDC_MINT, new PublicKey(payee), true).toBase58() : "";
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (!tx || tx.meta?.err) continue;
    const all: any[] = [
      ...(tx.transaction.message.instructions as any[]),
      ...((tx.meta?.innerInstructions ?? []).flatMap((x) => x.instructions) as any[]),
    ];
    for (const ix of all) {
      const t = ix.parsed?.type, info = ix.parsed?.info;
      if (!info) continue;
      if (cur === "SOL" && ix.program === "system" && t === "transfer" && info.destination === payee && Number(info.lamports) >= base * 0.995)
        return { sig: s.signature, from: info.source, time: s.blockTime ?? null };
      if (cur === "USDC" && ix.program === "spl-token" && (t === "transferChecked" || t === "transfer") && info.destination === payeeAta) {
        const amt = Number(info.tokenAmount?.amount ?? info.amount);
        if ((t === "transfer" || info.mint === USDC_MINT.toBase58()) && amt >= base * 0.995)
          return { sig: s.signature, from: info.authority ?? info.source, time: s.blockTime ?? null };
      }
    }
  }
  return null;
}

export interface Incoming { sig: string; base: number; memo: string; keys: Set<string>; from: string; time: number | null }
const parsedCache = new Map<string, Incoming | null>();

/** Fallback: look at the host's recent incoming payments (in case a wallet dropped the reference key). */
export async function scanPayee(payee: string, cur: Cur, sinceSec: number): Promise<Incoming[]> {
  const watch = cur === "USDC" ? getAssociatedTokenAddressSync(USDC_MINT, new PublicKey(payee), true) : new PublicKey(payee);
  const target = watch.toBase58();
  const sigs = await connection.getSignaturesForAddress(watch, { limit: 25 }, "confirmed");
  const out: Incoming[] = [];
  for (const s of sigs) {
    if (s.err || (s.blockTime && s.blockTime < sinceSec)) continue;
    if (!parsedCache.has(s.signature)) {
      const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
      let inc: Incoming | null = null;
      if (tx && !tx.meta?.err) {
        const ixs: any[] = [
          ...(tx.transaction.message.instructions as any[]),
          ...((tx.meta?.innerInstructions ?? []).flatMap((x) => x.instructions) as any[]),
        ];
        let base = 0, from = "", memo = "";
        for (const ix of ixs) {
          if (ix.program === "spl-memo" && typeof ix.parsed === "string") memo += ix.parsed;
          const t = ix.parsed?.type, info = ix.parsed?.info;
          if (!info || info.destination !== target) continue;
          if (cur === "SOL" && ix.program === "system" && t === "transfer") { base += Number(info.lamports); from = info.source; }
          if (cur === "USDC" && ix.program === "spl-token" && (t === "transfer" || t === "transferChecked")) {
            base += Number(info.tokenAmount?.amount ?? info.amount); from = info.authority ?? info.source;
          }
        }
        const keys = new Set(tx.transaction.message.accountKeys.map((k: any) => (k.pubkey ?? k).toString()));
        if (base > 0) inc = { sig: s.signature, base, memo, keys, from, time: s.blockTime ?? null };
      }
      parsedCache.set(s.signature, inc);
    }
    const inc = parsedCache.get(s.signature);
    if (inc) out.push(inc);
  }
  return out;
}

export async function solUsdRate(): Promise<number> {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    const j = await r.json();
    const p = Number(j?.solana?.usd);
    if (p > 0) return p;
  } catch { /* offline */ }
  return 150;
}
