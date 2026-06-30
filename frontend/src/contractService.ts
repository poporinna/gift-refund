import { createClient, createAccount } from "genlayer-js";
import { testnetAsimov } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { CONTRACT_ADDRESS, GENLAYER_NETWORK } from "./chain";

type Hex = `0x${string}`;
const TIMEOUT_MS = 240_000;

export type CardState = "VALID" | "PARTIAL" | "EMPTY" | "";

export interface Balance { loaded: string; remaining: string; drained: string; debits: number; }

export interface CardView {
  holder: string;
  label: string;
  history: string;
  reading: Balance;
  refundPaid: string;
  phase: number;
  state: CardState;
  rationale: string;
}
export interface CardRow extends CardView { id: number; }

export interface Stats { enrolled: number; ruled: number; empty: number; }
export interface Pool { pool: string; refundedTotal: string; }

function readClient() { return createClient({ chain: testnetAsimov, account: createAccount() }); }
function writeClient(account: Hex) { return createClient({ chain: testnetAsimov, account }); }
async function ensureConnected(client: any) { try { if (typeof client.connect === "function") await client.connect(GENLAYER_NETWORK); } catch { /* noop */ } }
async function waitAccepted(client: any, hash: Hex) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Transaction timed out")), TIMEOUT_MS); });
  try { await Promise.race([client.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.ACCEPTED, interval: 5000, retries: 64 }), timeout]); }
  finally { if (timer) clearTimeout(timer); }
}
function pick(obj: any, key: string, idx: number): any { if (obj == null) return undefined; if (Array.isArray(obj)) return obj[idx]; if (typeof obj === "object" && key in obj) return obj[key]; return undefined; }
async function write(account: Hex, functionName: string, args: any[], value = 0n): Promise<void> {
  const wc = writeClient(account); await ensureConnected(wc);
  const h = (await wc.writeContract({ address: CONTRACT_ADDRESS as Hex, functionName, args, value })) as Hex;
  await waitAccepted(wc, h);
}

// ---- Lifecycle: fund_pool, enroll_card -> reconcile_balance -> rule -> refund_or_close ----

export async function fundPool(account: Hex, wei: bigint): Promise<void> { await write(account, "fund_pool", [], wei); }
export async function enrollCard(account: Hex, label: string, history: string): Promise<number> {
  await write(account, "enroll_card", [label.trim(), history.trim()]);
  const s = await getStats();
  return s.enrolled - 1;
}
export async function reconcileBalance(account: Hex, id: number): Promise<void> { await write(account, "reconcile_balance", [id]); }
export async function rule(account: Hex, id: number): Promise<void> { await write(account, "rule", [id]); }
export async function refundOrClose(account: Hex, id: number): Promise<void> { await write(account, "refund_or_close", [id]); }

// ---- Views ----

function decodeReading(r: any): Balance {
  return {
    loaded: String(pick(r, "loaded", 0) ?? "0"),
    remaining: String(pick(r, "remaining", 1) ?? "0"),
    drained: String(pick(r, "drained", 2) ?? "0"),
    debits: Number(pick(r, "debits", 3) ?? 0),
  };
}

export async function getCard(id: number): Promise<CardView> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_card", args: [id] });
  return {
    holder: String(pick(r, "holder", 0) ?? ""),
    label: String(pick(r, "label", 1) ?? ""),
    history: String(pick(r, "history", 2) ?? ""),
    reading: decodeReading(pick(r, "reading", 3)),
    refundPaid: String(pick(r, "refund_paid", 4) ?? "0"),
    phase: Number(pick(r, "phase", 5) ?? 0),
    state: String(pick(r, "state", 6) ?? "") as CardState,
    rationale: String(pick(r, "rationale", 7) ?? ""),
  };
}

export async function getRefundEstimate(id: number): Promise<{ drained: string; covered: boolean }> {
  const raw = String(await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_refund_estimate", args: [id] }) ?? "");
  const out: any = { drained: "0", covered: false };
  raw.split("|").forEach((kv) => { const [k, v] = kv.split("="); if (k === "drained") out.drained = v || "0"; if (k === "covered") out.covered = v === "1"; });
  return out;
}
export async function checkIntegrity(id: number): Promise<string> {
  return String(await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "check_integrity", args: [id] }) ?? "");
}

// get_pool_balance -> "pool||refunded_total"
export async function getPool(): Promise<Pool> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_pool_balance", args: [] });
  const p = String(r).split("||");
  return { pool: p[0] || "0", refundedTotal: p[1] || "0" };
}
// get_stats -> "enrolled||ruled||empty"
export async function getStats(): Promise<Stats> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_stats", args: [] });
  const p = String(r).split("||").map((x) => Number(x) || 0);
  return { enrolled: p[0] || 0, ruled: p[1] || 0, empty: p[2] || 0 };
}

export async function listAll(maxRows = 80): Promise<CardRow[]> {
  const { enrolled } = await getStats();
  if (enrolled === 0) return [];
  const ids: number[] = [];
  for (let i = enrolled - 1; i >= 0 && i >= enrolled - maxRows; i--) ids.push(i);
  const rows = await Promise.all(ids.map(async (id) => { try { const c = await getCard(id); return { id, ...c }; } catch { return null; } }));
  return rows.filter((r): r is CardRow => r !== null);
}
