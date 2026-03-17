# Scanners - Blockchain Analysis Engine

> **High-performance multi-blockchain scanner with unified architecture**

The core analysis engine of BugChainIndexer. Transfer + Approval event-based address discovery, contract verification, and balance tracking across 11 EVM networks.

## Architecture

```
scanners/
├── core/                   # Core scanners
│   ├── UnifiedScanner.js        # Transfer + Approval event pipeline
│   ├── ParallelRunner.js        # Multi-network parallel executor
│   ├── FundUpdater.js           # Portfolio balance tracker
│   └── DataRevalidator.js       # Data validation & retagging
├── common/                 # Shared modules
│   ├── core.js                  # Constants, RPC client, Etherscan API
│   ├── database.js              # PostgreSQL operations (addresses, approvals)
│   ├── Scanner.js               # Base scanner class
│   ├── LogFetcher.js            # Adaptive log fetching (getLogs)
│   ├── EOAFilter.js             # EOA vs Contract classification
│   ├── ContractVerifier.js      # Etherscan source verification
│   ├── alchemyRpc.js            # Alchemy RPC client
│   ├── index.js                 # Re-exports
│   └── ...
├── config/
│   ├── networks.js              # 11 network configurations
│   └── genesis-timestamps.js    # Genesis block timestamps
├── cron/                   # Automation scripts
│   ├── cron-unified.sh
│   ├── cron-funds.sh
│   └── ...
├── tests/                  # Test scripts
└── run.sh                  # Main executor
```

## Quick Start

### Setup
```bash
cp .env.example .env
# Edit .env with your API keys and database credentials
npm install
```

### Run Scanners
```bash
# Address discovery + Approval tracking (Transfer + Approval events)
./run.sh unified

# Update asset balances
./run.sh funds

# Validate existing data
./run.sh revalidate

# Run all scanners
./run.sh all
```

### Network-Specific Execution
```bash
NETWORK=ethereum ./run.sh unified
NETWORK=arbitrum ./run.sh funds
```

## Core Pipelines

### UnifiedScanner — Address Discovery + Approval Tracking
```
Transfer + Approval Events (eth_getLogs, single request)
  ├─ Transfer logs:
  │   → Extract addresses from logs (token, from, to)
  │   → Filter existing (skip known addresses)
  │   → EOA vs Contract classification (isContract batch check)
  │   → Contract verification (Etherscan getsourcecode)
  │   → Database storage (addresses table)
  └─ Approval logs:
      → Parse (owner, spender, token, value)
      → Database upsert (approvals table, deduped by PK)
```
- Collects both Transfer and Approval events in a single `eth_getLogs` call per block range
- Approval data is stored to the `approvals` table alongside address discovery

### ParallelRunner — Multi-Network Executor
```bash
node core/ParallelRunner.js unified      # All networks, 8 concurrent
node core/ParallelRunner.js unified 4    # Limit to 4 concurrent
```

## Configuration

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

### Optional Settings
```bash
# Timeouts
TIMEOUT_SECONDS=7200            # Scanner timeout (default: 2 hours)

# Scan range
TIMEDELAY=4                     # UnifiedScanner: hours to look back

# Fund updates
FUNDUPDATEDELAY=7               # Days between fund updates
FUND_UPDATE_MAX_BATCH=50000     # Max addresses per batch
ALL_FLAG=true                   # Process all addresses
HIGH_FUND_FLAG=true             # Only high-value (>100k USD)

# Proxies (optional)
USE_ALCHEMY_PROXY=false
ALCHEMY_PROXY_URL=http://localhost:3002
USE_ETHERSCAN_PROXY=false
ETHERSCAN_PROXY_URL=http://localhost:3000
```

## Supported Networks (11)

| Network | Chain ID | Alchemy | BalanceHelper |
|---------|----------|---------|---------------|
| Ethereum | 1 | Yes | `0xF6eDe5F60e6fB769F7571Ad635bF1Db0735a7386` |
| BNB Smart Chain | 56 | Yes | `0xf481b013532d38227F57f46217B3696F2Ae592c8` |
| Polygon | 137 | Yes | `0xC55d7D06b3651816ea51700CB91235cd60Dd4d7D` |
| Arbitrum | 42161 | Yes | `0xdD5cFc64f74B2b5A4e80031DDf84597be449E3E3` |
| Optimism | 10 | Yes | `0x3d2104Da2B23562c47DCAE9EefE5063b6aB5c637` |
| Base | 8453 | Yes | `0xa3ba28ccDDa4Ba986F20E395D41F5bb37F8f900d` |
| Avalanche | 43114 | Yes | `0xa3ba28ccDDa4Ba986F20E395D41F5bb37F8f900d` |
| Gnosis | 100 | Yes | `0x510E86Be47994b0Fbc9aEF854B83d2f8906F7AD7` |
| Linea | 59144 | Yes | `0x06318Df33cea02503afc45FE65cdEAb8FAb3E20A` |
| Scroll | 534352 | Yes | `0x06318Df33cea02503afc45FE65cdEAb8FAb3E20A` |
| Mantle | 5000 | Yes | `0xeAbB01920C41e1C010ba74628996EEA65Df03550` |

## Database Schema

### `addresses` table
Primary store for discovered addresses (contracts and EOAs).
- PK: `(address, network)`
- Key fields: `deployed`, `fund`, `code_hash`, `contract_name`, `tags`

### `approvals` table
ERC20 Approval events collected alongside Transfer events.
- PK: `(owner, spender, token_address, network)`
- Key fields: `value`, `block_number`, `tx_hash`, `first_seen`, `last_updated`
- Indexes: spender, network, block_number, token_address

## API Endpoints

### Address API
- `GET /api/getAddressesByFilter` — Query addresses with filters
- `GET /api/getContractCount` — Contract counts by network
- `GET /api/networkCounts` — Network statistics

### Approval API
- `GET /api/approvals` — Query approvals (filter by owner, spender, token, network)
- `GET /api/approvals/stats` — Approval statistics by network

## System Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 2 GB | 4-8 GB |
| Disk | 10 GB | 50 GB+ |
| Node.js | v16+ | v18+ LTS |
| PostgreSQL | 12+ | 14+ |

### External Services
- **Alchemy** (required) — RPC calls, getLogs
- **Etherscan** (required) — Contract verification, block-by-timestamp
- **Redis** (optional) — Backend API caching

## Automation (Cron)

```bash
# Setup
./cron/setup-cron.sh --auto-setup
```

| Scanner | Schedule | Script |
|---------|----------|--------|
| UnifiedScanner | Every 4 hours | `cron/cron-unified.sh` |
| FundUpdater | Every 6 hours | `cron/cron-funds.sh` |
| DataRevalidator | Weekly (Sun 2AM) | `cron/cron-revalidate.sh` |
| DB Optimization | Daily (5AM) | `cron/cron-db-daily.sh` |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| API errors | Check API keys in `.env` |
| Database slow | Run `./run.sh db-optimize-fast` |
| RPC failures | Check `config/networks.js` |
| Lock file stuck | Remove `/tmp/scanner-*.lock` |
| Alchemy rate limit | Set `ALCHEMY_TIER=free` or reduce batch size |
