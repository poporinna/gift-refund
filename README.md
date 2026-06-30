# Cardledger

Gift-card balance reconciliation on [GenLayer](https://genlayer.com). A holder enrols a card with its transaction history and gateway logs; a validator panel reconstructs the loaded and remaining value under consensus, rules the card VALID, PARTIAL, or EMPTY, and atomically refunds the drained amount from a shared pool.

## How it works

1. Fund the pool: anyone funds the shared refund pool with attached GEN.
2. Enrol a card: a holder submits a label plus the card's transaction history and redemption logs.
3. Reconcile: a validator jury reconstructs, via an LLM, the loaded and remaining value (in minor units) and the debit-event count, and must agree on the card state and both figures within tolerance.
4. Rule: the state freezes to VALID (untouched), PARTIAL (partly drained), or EMPTY (fully drained) from the reconstructed figures.
5. Refund or close: the drained amount is refunded in full from the pool, or an untouched card is closed. Refunds are atomic — if the pool cannot cover the full amount, the call reverts.

## Architecture

```
backend/gift-refund.py   GenLayer Intelligent Contract (Python, runs on the GenVM)
frontend/                React + Vite + TypeScript desk (genlayer-js)
```

The consensus object is a two-measure (loaded, remaining) pair rebuilt from the ledger and cross-checked by a debit-event count, so validators must agree on the card state and both monetary figures within tolerance before any refund is paid.

## Live deployment

- **Network**: GenLayer Asimov Testnet (chain id 4221)
- **Contract**: `0xA2d67Df68a3da99dAB238589aA7D35D491F4DB8F`
- **App**: https://poporinna.github.io/gift-refund/

## Run locally

```bash
cd frontend
npm install
npm run dev
npm run build
```

The committed `.env` holds the public Asimov config; no secrets are required. Copy `.env.example` to `.env.local` only to override.

## Environment variables

| Name | Required | Description |
|------|----------|-------------|
| `VITE_CONTRACT_ADDRESS` | yes | Deployed CardLedger contract on Asimov |
| `VITE_CHAIN_ID` | yes | GenLayer chain id (4221) |
| `VITE_RPC_URL` | yes | Asimov JSON-RPC endpoint |

## Deploy the contract

```bash
npx genlayer deploy --contract backend/gift-refund.py
```

## Contract methods (`CardLedger`)

| Method | Type | Description |
|--------|------|-------------|
| `fund_pool` | payable | Fund the shared refund pool with attached GEN. |
| `enroll_card` | write | Enrol a card with its label and transaction history / logs. |
| `reconcile_balance` | write | Reconstruct loaded / remaining / debit count via the LLM jury. |
| `rule` | write | Freeze the card state from the reconstructed figures. |
| `refund_or_close` | write | Refund the drained value atomically, or close an untouched card. |
| `get_card` | view | Full card record. |
| `get_phase` | view | Lifecycle phase name (ENROLLED / RECONCILED / RULED / CLOSED). |
| `get_state` | view | Card state (VALID / PARTIAL / EMPTY). |
| `get_balance` | view | Loaded / remaining / drained / debits for the card. |
| `get_holder` | view | The enrolling holder address. |
| `get_rationale` | view | The jury's reconciliation rationale. |
| `get_refund_estimate` | view | Drained amount and whether the pool covers it. |
| `describe_states` | view | The meaning of each card state. |
| `describe_codes` | view | The two-letter error-code vocabulary. |
| `get_label` | view | The card label supplied at enrolment. |
| `get_loaded` | view | Reconstructed original face value (minor units). |
| `get_remaining` | view | Reconstructed remaining balance (minor units). |
| `get_drained` | view | Drained amount (loaded - remaining). |
| `get_summary` | view | Compact one-line digest for dashboards. |
| `get_pool_balance` | view | Pool balance and refunded total. |
| `get_debits` | view | Reconstructed number of redemption events. |
| `get_history_excerpt` | view | First N characters of the stored card history. |
| `describe_tolerances` | view | The validator tolerances enforced. |
| `check_integrity` | view | Verify drained equals loaded minus remaining for a card. |
| `get_stats` | view | Enrolled / ruled / empty counts. |

## License

MIT
