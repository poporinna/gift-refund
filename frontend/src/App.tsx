import { Suspense, lazy, useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { parseEther, formatEther } from "viem";
import {
  fundPool, enrollCard, reconcileBalance, rule, refundOrClose,
  getCard, getStats, getPool, getRefundEstimate, listAll,
  CardView, CardRow, Stats, Pool,
} from "./contractService";
import { CONTRACT_ADDRESS } from "./chain";

const VolumeFieldScene = lazy(() => import("./VolumeFieldScene"));

type Hex = `0x${string}`;
const PHASE_LABEL = ["enrolled", "reconciled", "ruled", "closed"];
const toWei = (g: string): bigint => { try { return parseEther((g || "0").trim()); } catch { return 0n; } };
const gen = (wei: string): string => { try { return formatEther(BigInt(wei || "0")); } catch { return wei || "0"; } };

function WalletControl() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;
        if (!connected) return <button className="wbtn" onClick={openConnectModal} type="button">Connect Wallet</button>;
        if (chain?.unsupported) return <button className="wbtn wbtn-warn" onClick={openChainModal} type="button">Wrong network</button>;
        return <button className="wchip" onClick={openAccountModal} type="button"><span className="wdot" />{account.displayName}</button>;
      }}
    </ConnectButton.Custom>
  );
}

function ruling(state: string): { tag: string; line: string } {
  if (state === "VALID") return { tag: "valid", line: "Untouched card — full balance intact, nothing to refund." };
  if (state === "PARTIAL") return { tag: "partial", line: "Partially drained — the spent difference is refunded from the pool." };
  if (state === "EMPTY") return { tag: "empty", line: "Fully drained — the entire loaded value is refundable." };
  return { tag: "", line: "-" };
}

export function App() {
  const { address, isConnected } = useAccount();
  const acct = address as Hex | undefined;
  const [label, setLabel] = useState("");
  const [history, setHistory] = useState("");
  const [funding, setFunding] = useState("10");

  const [rows, setRows] = useState<CardRow[]>([]);
  const [stats, setStats] = useState<Stats>({ enrolled: 0, ruled: 0, empty: 0 });
  const [pool, setPool] = useState<Pool>({ pool: "0", refundedTotal: "0" });
  const [selId, setSelId] = useState<number | null>(null);
  const [sel, setSel] = useState<CardView | null>(null);
  const [estimate, setEstimate] = useState<{ drained: string; covered: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function refreshAll() {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const [s, p, l] = await Promise.all([getStats(), getPool(), listAll(80)]);
      setStats(s); setPool(p); setRows(l);
      if (selId != null) { try { setSel(await getCard(selId)); } catch { /* keep */ } }
    } catch { /* offline */ }
  }
  useEffect(() => {
    refreshAll();
    const t = setInterval(refreshAll, 12000);
    const onVis = () => { if (!document.hidden) refreshAll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  async function select(id: number) {
    setSelId(id);
    try { setSel(await getCard(id)); } catch { setSel(null); }
    try { setEstimate(await getRefundEstimate(id)); } catch { setEstimate(null); }
  }
  async function act<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label); setError("");
    try { return await fn(); } catch (e: any) { setError((e?.message || String(e)).slice(0, 180)); return undefined; }
    finally { setBusy(null); refreshAll(); }
  }
  async function onEnroll() {
    if (!acct) return;
    if (label.trim().length < 1) return setError("Card label is required.");
    if (history.trim().length < 30) return setError("Transaction history ≥ 30 chars.");
    const id = await act("Enrolling the card", () => enrollCard(acct, label, history));
    if (id != null) { setLabel(""); setHistory(""); setSelId(id); }
  }
  async function onFund() { if (!acct) return; if (toWei(funding) <= 0n) return setError("Amount must be > 0 GEN."); await act("Funding the refund pool", () => fundPool(acct, toWei(funding))); }
  async function onReconcile() { if (!acct || selId == null) return; await act("Reconciling the balance", () => reconcileBalance(acct, selId)); }
  async function onRule() { if (!acct || selId == null) return; await act("Ruling the card state", () => rule(acct, selId)); }
  async function onRefund() { if (!acct || selId == null) return; await act("Refunding / closing", () => refundOrClose(acct, selId)); }

  const st = (sel?.state || "").toUpperCase();
  const r = ruling(st);
  const canEnroll = isConnected && label.trim() && history.trim().length >= 30 && !busy;

  return (
    <div className="page">
      <div className="hero">
        <Suspense fallback={null}><VolumeFieldScene /></Suspense>
        <div className="hero-shade" aria-hidden />
        <header className="nav">
          <span className="brand"><span className="mark" aria-hidden />card<b>ledger</b></span>
          <WalletControl />
        </header>
        <div className="hero-copy">
          <span className="kicker">Gift-card reconciliation desk</span>
          <h1>Every card posts its ledger.<br />We read the spend before we refund the drain.</h1>
          <p>
            Drained gift cards hide behind tidy balances. Enrol the card with its transaction
            history, and a validator panel reconstructs the loaded and remaining value, rules the
            card VALID, PARTIAL, or EMPTY, and atomically refunds the drained amount from the pool.
          </p>
        </div>
      </div>

      <main className="desk">
        <div className="stat-line">
          <span>enrolled <b>{stats.enrolled}</b></span>
          <span>ruled <b>{stats.ruled}</b></span>
          <span>empty <b>{stats.empty}</b></span>
          <span>pool <b>{gen(pool.pool)}</b> GEN</span>
          <span>refunded <b>{gen(pool.refundedTotal)}</b> GEN</span>
        </div>

        <ol className="flow">
          <li className="card">
            <div className="card-tag"><span className="idx">01</span><h2>Enrol a gift card</h2></div>
            <input className="txt" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="card label, e.g. Gift card #4417" />
            <p className="field-q">Transaction history + gateway/redemption log (≥ 30 chars).</p>
            <textarea value={history} onChange={(e) => setHistory(e.target.value)} placeholder="Initial load, each redemption/spend, current balance line…" />
            <button className="go" disabled={!canEnroll} onClick={onEnroll}>{busy === "Enrolling the card" ? "Enrolling…" : "Enrol the card"}</button>
          </li>

          <li className="card">
            <div className="card-tag"><span className="idx">02</span><h2>Fund the refund pool</h2></div>
            <p className="aid">Refunds are atomic — the pool must cover the drained amount in full.</p>
            <input className="txt" value={funding} onChange={(e) => setFunding(e.target.value)} placeholder="amount in GEN, e.g. 10" />
            <button className="go alt" disabled={!isConnected || !!busy} onClick={onFund}>Fund the pool</button>
          </li>

          {rows.length > 0 && (
            <li className="card">
              <div className="card-tag"><span className="idx">03</span><h2>Cards on the ledger</h2></div>
              <div className="stack">
                {rows.map((c) => (
                  <button key={c.id} type="button" className={"row " + (selId === c.id ? "row-on" : "")} onClick={() => select(c.id)}>
                    <span className="row-dot" aria-hidden />
                    <span className="row-main">
                      <span className="row-name">#{c.id} · {c.label}</span>
                      <span className="row-meta">{PHASE_LABEL[c.phase]} · loaded {c.reading.loaded} · remaining {c.reading.remaining} · drained {c.reading.drained}</span>
                    </span>
                    <span className={"st s-" + (c.state || "")}>{c.state || "pending"}</span>
                  </button>
                ))}
              </div>
            </li>
          )}

          {sel && selId != null && (
            <li className="card">
              <div className="card-tag"><span className="idx">#{selId}</span><h2>{sel.label}</h2></div>
              <div className="bal">
                <span>loaded <b>{sel.reading.loaded}</b></span>
                <span>remaining <b>{sel.reading.remaining}</b></span>
                <span>drained <b>{sel.reading.drained}</b></span>
                <span>debits <b>{sel.reading.debits}</b></span>
                <span>refund paid <b>{gen(sel.refundPaid)}</b> GEN</span>
              </div>
              {sel.phase === 0 && (<button className="go" disabled={!isConnected || !!busy} onClick={onReconcile}>Reconcile the balance</button>)}
              {sel.phase === 1 && (<button className="go" disabled={!isConnected || !!busy} onClick={onRule}>Rule the card state</button>)}
              {sel.phase === 2 && (
                <>
                  {estimate && <p className="aid">Drained <b>{estimate.drained}</b> (card units) — pool {estimate.covered ? "covers the refund" : "cannot cover it (refund will revert)"}.</p>}
                  <button className="go" disabled={!isConnected || !!busy} onClick={onRefund}>Refund or close</button>
                </>
              )}
              {sel.phase === 3 && <p className="aid">Closed. {Number(sel.refundPaid) > 0 ? `Refunded ${gen(sel.refundPaid)} GEN.` : "Card was untouched — nothing refunded."}</p>}
            </li>
          )}
        </ol>

        {!isConnected && <p className="note">Connect a wallet on GenLayer Asimov to enrol and reconcile cards.</p>}
        {error && <p className="err">{error}</p>}

        <div className={"verdict " + (busy ? "is-busy " : "") + (st ? "is-" + r.tag : "")}>
          {busy ? (
            <span className="busy">{busy}…</span>
          ) : sel && st ? (
            <>
              <div className="vhead">
                <span className="vword">{st}</span>
                <span className="vline">{r.line}</span>
              </div>
              {sel.rationale && <p className="vsum">{sel.rationale}</p>}
            </>
          ) : (
            <span className="idle">Select a card — its reconstructed state and reasoning surface here.</span>
          )}
        </div>
      </main>

      <footer className="foot">
        <span className="foot-mark">cardledger</span>
        <span className="foot-reg">Reconciled on GenLayer Asimov 4221 · {CONTRACT_ADDRESS.slice(0, 6)}…{CONTRACT_ADDRESS.slice(-4)}</span>
      </footer>
    </div>
  );
}
