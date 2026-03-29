# LP Mastery App

A self-hosted position management dashboard for Uniswap V4 concentrated liquidity positions. Monitor, analyze, manage, and act on your V4 positions — all without leaving this interface.

## Tech Stack

- **Next.js 14** (App Router, TypeScript strict)
- **Wagmi v2 + Viem** — wallet connection and contract reads/writes
- **RainbowKit v2** — wallet UI (WalletConnect + MetaMask)
- **TanStack Query v5** — all async state management
- **Tailwind CSS v3** — styling
- **Recharts v2** — charts
- **Zod v3** — env var validation at startup
- **Uniswap V4 SDK** — pool/position primitives
- **Universal Router SDK** — swap calldata construction

## Local Development

### Prerequisites

- Node.js 20+
- npm 10+
- A WalletConnect project ID ([get one free](https://cloud.walletconnect.com))

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in env vars
cp .env.example .env.local
# Edit .env.local and set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

# 3. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/dashboard`.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server at localhost:3000 |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |
| `npm run type-check` | TypeScript type check (no emit) |

## Project Structure

```
src/
├── abis/              # Contract ABIs as typed constants
├── app/               # Next.js App Router pages and layouts
│   ├── layout.tsx     # Root layout (providers)
│   ├── page.tsx       # Redirects to /dashboard
│   └── dashboard/     # Position dashboard route
├── components/
│   ├── dashboard/     # Position cards, metrics, etc.
│   ├── layout/        # Sidebar, app shell
│   └── wallet/        # Wallet connect button
├── config/
│   └── contracts.ts   # Chain-keyed Uniswap V4 contract addresses
├── hooks/             # Custom React hooks (data fetching, contract calls)
├── lib/
│   ├── env.ts         # Zod-validated env vars (fails fast at startup)
│   ├── utils.ts       # cn() and other utilities
│   └── wagmi.ts       # Wagmi config (chains, connectors)
└── providers/
    └── index.tsx      # Wagmi + TanStack Query + RainbowKit providers
```

## Supported Networks

| Network | Chain ID |
|---------|----------|
| Ethereum Mainnet | 1 |
| Base | 8453 |
| Sepolia (dev) | 11155111 |
| Base Sepolia (dev) | 84532 |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_FEE_RECIPIENT` | Yes | Operator wallet for 20bps interface fee |
| `NEXT_PUBLIC_SUPPORTED_CHAINS` | Yes | Comma-separated chain IDs (e.g. `1,8453`) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Yes | WalletConnect cloud project ID |

## Architecture Notes

- **Position reads** go through the **StateView** contract — never the PositionManager directly.
- **All swaps** route through the **Universal Router** using `V4Planner`. A 20bps `PAY_PORTION` fee command is always included.
- **Position discovery** uses off-chain event indexing (no on-chain enumeration in V4).
- **No `any` types**. No `@ts-ignore` without justification. `strict: true` enforced.
