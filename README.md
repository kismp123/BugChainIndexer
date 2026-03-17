# BugChainIndexer

> **Multi-blockchain contract analysis and ERC20 approval tracking system**

**Live Platform: https://bugchain.xyz/**

BugChainIndexer monitors, analyzes, and indexes smart contract data across 14 EVM networks. It discovers active addresses and tracks ERC20 Approval events via a unified Transfer + Approval event pipeline, and provides a REST API for querying the indexed data.

## Key Features

- **Unified Event Pipeline** — Discover active addresses and track ERC20 approvals from Transfer + Approval events in a single `eth_getLogs` call
- **11 EVM Networks** — Ethereum, BSC, Polygon, Arbitrum, Optimism, Base, Avalanche, Gnosis, Linea, Scroll, Mantle
- **Adaptive Batching** — Dynamic batch sizing based on log density and response time
- **Contract Verification** — Etherscan API integration for source code verification
- **REST API** — Filter addresses, query approvals, view network statistics

## Architecture

```
BugChainIndexer/
├── scanners/                       # Core analysis engine
│   ├── core/
│   │   ├── UnifiedScanner.js            # Transfer + Approval event pipeline
│   │   ├── ParallelRunner.js            # Multi-network parallel executor
│   │   ├── FundUpdater.js              # Balance/TVL tracker
│   │   └── DataRevalidator.js          # Data consistency validation
│   ├── common/
│   │   ├── core.js                      # Constants, RPC, Etherscan API
│   │   ├── database.js                  # PostgreSQL (addresses, approvals)
│   │   ├── Scanner.js                   # Base scanner class
│   │   ├── LogFetcher.js               # Adaptive eth_getLogs
│   │   ├── EOAFilter.js                # EOA vs Contract classification
│   │   ├── ContractVerifier.js         # Etherscan verification
│   │   └── alchemyRpc.js              # Alchemy RPC client
│   ├── config/
│   │   └── networks.js                  # 11 network configurations
│   ├── cron/                            # Automation scripts
│   └── run.sh                           # Main executor
├── server/
│   └── backend/                    # REST API
│       ├── routes/public.js             # /api endpoints
│       ├── controllers/                 # Request handlers
│       └── services/                    # DB query logic
└── docs/
```

## Quick Start

### Prerequisites

- Node.js v16+ (v18+ recommended)
- PostgreSQL 12+
- Alchemy API key
- Etherscan API keys (4 recommended)

### Setup

```bash
# Install scanner dependencies
cd scanners && npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Install backend dependencies
cd ../server/backend && npm install
```

### Required Environment Variables

```bash
# Database
PGHOST=localhost
PGPORT=5432
PGDATABASE=bugchain_indexer
PGUSER=postgres
PGPASSWORD=your_password

# API Keys
ALCHEMY_API_KEY=your_alchemy_key
DEFAULT_ETHERSCAN_KEYS=key1,key2,key3,key4
```

### Run Scanners

```bash
cd scanners

# Address discovery + Approval tracking (Transfer + Approval events)
./run.sh unified

# Update asset balances
./run.sh funds

# Single network
NETWORK=ethereum ./run.sh unified

# All networks in parallel
./run.sh unified parallel
```

### Start API Server

```bash
cd server/backend
npm start
```

## Pipelines

### UnifiedScanner — Address Discovery + Approval Tracking

```
eth_getLogs (Transfer + Approval events, single request)
  ├─ Transfer logs:
  │   → Extract addresses (token contract, from, to)
  │   → Skip known addresses
  │   → EOA vs Contract classification
  │   → Contract verification (Etherscan)
  │   → Store in addresses table
  └─ Approval logs:
      → Parse owner, spender, token, value
      → Store in approvals table (upsert by PK)
```

### FundUpdater — Balance Tracking

Uses BalanceHelper contracts for batch balance queries (native + ERC20).
Calculates USD portfolio value with token price caching.

### DataRevalidator — Data Consistency

Reclassifies addresses with incomplete data (missing tags, code_hash, deployed time).
Fetches contract names from Etherscan for unverified contracts.

## Supported Networks (11)

| Network | Chain ID | BalanceHelper |
|---------|----------|---------------|
| Ethereum | 1 | `0xF6eDe5F60e6fB769F7571Ad635bF1Db0735a7386` |
| BNB Smart Chain | 56 | `0xf481b013532d38227F57f46217B3696F2Ae592c8` |
| Polygon | 137 | `0xC55d7D06b3651816ea51700CB91235cd60Dd4d7D` |
| Arbitrum | 42161 | `0xdD5cFc64f74B2b5A4e80031DDf84597be449E3E3` |
| Optimism | 10 | `0x3d2104Da2B23562c47DCAE9EefE5063b6aB5c637` |
| Base | 8453 | `0xa3ba28ccDDa4Ba986F20E395D41F5bb37F8f900d` |
| Avalanche | 43114 | `0xa3ba28ccDDa4Ba986F20E395D41F5bb37F8f900d` |
| Gnosis | 100 | `0x510E86Be47994b0Fbc9aEF854B83d2f8906F7AD7` |
| Linea | 59144 | `0x06318Df33cea02503afc45FE65cdEAb8FAb3E20A` |
| Scroll | 534352 | `0x06318Df33cea02503afc45FE65cdEAb8FAb3E20A` |
| Mantle | 5000 | `0xeAbB01920C41e1C010ba74628996EEA65Df03550` |

All networks use Alchemy RPC for getLogs and all RPC calls.

## API Endpoints

### Address API

```
GET /api/getAddressesByFilter   # Filter addresses (network, fund, name, etc.)
GET /api/getContractCount       # Contract count
GET /api/networkCounts          # Per-network statistics
```

### Approval API

```
GET /api/approvals              # Query approvals (owner, spender, token, network)
GET /api/approvals/stats        # Approval statistics by network
```

## Database Schema

### `addresses` table
Discovered addresses from Transfer + Approval events.
- PK: `(address, network)`
- Fields: `deployed`, `fund`, `code_hash`, `contract_name`, `tags`, `first_seen`

### `approvals` table
ERC20 Approval events collected alongside Transfer events.
- PK: `(owner, spender, token_address, network)`
- Fields: `value`, `block_number`, `tx_hash`, `first_seen`, `last_updated`

## System Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 2 GB | 4-8 GB |
| Disk | 10 GB | 50 GB+ |
| Node.js | v16+ | v18+ LTS |
| PostgreSQL | 12+ | 14+ |

**External Services:**
- Alchemy (required) — All RPC calls
- Etherscan (required) — Contract verification
- Redis (optional) — Backend API caching

## Automation

```bash
cd scanners/cron && ./setup-cron.sh --auto-setup
```

| Scanner | Schedule |
|---------|----------|
| UnifiedScanner | Every 4 hours |
| FundUpdater | Every 6 hours |
| DataRevalidator | Weekly (Sun 2AM) |
| DB Optimization | Daily (5AM) |

## Configuration Reference

```bash
# Scanner timing
TIMEDELAY_HOURS=4               # UnifiedScanner lookback (hours)
TIMEOUT_SECONDS=7200            # Scanner timeout (seconds)

# Fund updates
FUNDUPDATEDELAY=7               # Days between updates
FUND_UPDATE_MAX_BATCH=50000     # Max addresses per batch
ALL_FLAG=true                   # Process all addresses
HIGH_FUND_FLAG=true             # Only high-value (>100k USD)

# Proxies (optional)
USE_ALCHEMY_PROXY=false
ALCHEMY_PROXY_URL=http://localhost:3002
USE_ETHERSCAN_PROXY=false
ETHERSCAN_PROXY_URL=http://localhost:3000
```

## License

MIT
