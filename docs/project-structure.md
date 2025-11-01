# BugChainIndexer - Project Structure Documentation

## Overview

BugChainIndexer is a comprehensive system that analyzes and indexes smart contracts across 14 blockchain networks (12 active). This document explains the detailed structure of the project and the role of each component.

## Overall Project Structure

```
BugChainIndexer/
├── scanners/              # Blockchain scanner and analysis engine
├── server/                # Backend API and frontend web interface
├── contract/              # Smart contracts (Foundry project)
├── docs/                  # Project documentation
├── .claude/               # Claude AI configuration
├── README.md              # Project main documentation
└── SETUP.md              # Installation guide
```

---

## Detailed Directory Structure

### 1. scanners/ - Blockchain Scanner

Core engine for collecting, analyzing, and storing blockchain data.

#### scanners/common/ - Common Utilities

```
common/
├── core.js                # Core blockchain functions (Alchemy integration)
├── database.js            # PostgreSQL database connection and queries
├── Scanner.js             # Base scanner class (dual RPC clients)
├── alchemyRpc.js          # Alchemy RPC client (includes Prices API)
├── TokenPriceCache.js     # Token price caching system
├── addressUtils.js        # EIP-55 address validation and normalization
├── chunkOptimizer.js      # Batch size optimization
├── suiRpc.js              # Sui blockchain RPC client
└── suiBatchBalances.js    # Sui batch balance queries
```

**Key Features:**
- Stable data access with Alchemy API integration
- Address validation using EIP-55 checksum
- Dynamic batch size adjustment (50-1000 addresses)
- Token price caching (7-day TTL)

#### scanners/core/ - Scanner Implementations

```
core/
├── UnifiedScanner.js      # Main analysis pipeline (5-in-1)
├── FundUpdater.js         # Asset tracker (uses Advisory Locks)
├── DataRevalidator.js     # Data validation and reclassification
├── SuiTransferScanner.js  # Sui blockchain transfer scanner
└── SuiFundUpdater.js      # Sui blockchain asset updater
```

**UnifiedScanner.js** - 5-in-1 integrated pipeline:
1. Transfer event collection
2. Address filtering
3. EOA vs Contract detection
4. Contract source code verification
5. Database storage

**FundUpdater.js** - Portfolio tracking:
- Uses Alchemy Prices API
- Concurrency control with PostgreSQL Advisory Locks
- Network-specific token decimals accuracy
- Includes ERC20 balance checks

**DataRevalidator.js** - Data quality management:
- Revalidates incomplete data
- Contract reclassification
- 455x performance improvement (partial indexes)

#### scanners/config/ - Configuration Files

```
config/
└── networks.js            # 18 network configurations
```

**Network Configuration Includes:**
- RPC endpoints
- Etherscan API URLs
- Alchemy network IDs
- BalanceHelper contract addresses

#### scanners/tokens/ - Token Configurations

```
tokens/
├── ethereum.json          # 99 tokens (includes decimals)
├── binance.json           # 100 tokens
├── polygon.json
├── arbitrum.json
├── optimism.json
├── base.json
├── avalanche.json
├── gnosis.json
├── linea.json
├── scroll.json
├── mantle.json
├── opbnb.json
├── unichain.json
├── berachain.json
├── sui.json
└── ... (18 networks total, 1,254 tokens)
```

**Role:**
- Provides accurate token decimals for FundUpdater
- Network-specific major token metadata
- Reads decimals from files rather than DB (for accuracy)

#### scanners/utils/ - Database Utilities

```
utils/
├── db-optimize.js              # General DB optimization
├── db-optimize-large.js        # Large DB optimization (10GB+)
├── db-cleanup.js               # Old cache cleanup
├── db-normalize-addresses.js   # Address normalization
├── remove-unused-indexes.js    # Remove unused indexes
└── optimize-index-fillfactor.js # Index fillfactor optimization
```

**Optimization Strategy:**
- Daily: db-optimize-fast (quick optimization)
- Weekly: db-optimize (includes VACUUM)
- Monthly: db-optimize-large (for large DBs)

#### scanners/cron/ - Automation

```
cron/
└── setup-cron.sh          # Automatic cron job setup
```

**Default Schedule:**
- Unified analysis: Every 4 hours
- Fund updates: Every 6 hours
- Data validation: Weekly (Sunday 2 AM)
- DB optimization: Daily maintenance

#### scanners/tests/ - Test Scripts

```
tests/
├── test-blockberry-packages.js
├── test-sui-batch-balances.js
├── test-sui-fund-updater.js
├── test-sui-package.js
├── test-sui-real-address.js
├── test-sui-source-code.js
├── test-sui-token-balance.js
└── test-sui-transfer-scanner-updated.js
```

#### scanners/migrations/ - Database Migrations

DB schema changes and migration scripts

#### scanners/data/ - Data Storage

Temporary data and cache collected by scanners

#### scanners/logs/ - Log Files

Automatically saved scanner execution logs

#### scanners/run.sh - Main Execution Script

```bash
# Single network scan
NETWORK=ethereum ./run.sh unified

# Parallel scan all networks
./run.sh unified parallel

# Asset update
NETWORK=ethereum ./run.sh funds

# Data revalidation
./run.sh revalidate

# DB optimization
./run.sh db-optimize
```

---

### 2. server/ - Backend and Frontend

Provides web API server and user interface.

#### server/backend/ - REST API Server

```
backend/
├── index.js                   # Express server entry point
├── app.js                     # Express app configuration
├── package.json               # Dependencies (Express, PostgreSQL, Redis)
├── .env_example               # Environment variables example
│
├── routes/
│   └── public.js              # Public API routes
│
├── controllers/
│   └── address.controller.js  # Address lookup controller
│
├── services/
│   ├── address.service.js     # Optimized query service
│   └── db.js                  # Database connection pool
│
└── utils/
    └── parsers.js             # Data parsing utilities
```

**Key Features:**
- **Performance Optimization**: 25s → under 1s (96% improvement)
- **Composite Indexes**: (fund DESC, deployed DESC, address ASC)
- **Network Count Caching**: 4-hour TTL (23s → 0.09s)
- **Smart COUNT Strategy**:
  - Fast path: Use cached network counts
  - COUNT skip: When 10+ networks filtered
  - Accurate COUNT: Only when needed

**API Endpoints:**

```
GET /getAddressesByFilter
  - limit: Results per page (1-200, default 50)
  - includeTotal: Whether to calculate total count
  - networks: Network filter (comma-separated)
  - address: Address search
  - contractName: Contract name search
  - deployedFrom/deployedTo: Unix timestamp range
  - fundFrom/fundTo: USD value range
  - cursor: Pagination cursor

GET /getContractCount
  - Total contract count

GET /networkCounts
  - Network statistics (4-hour cache)
```

**Tech Stack:**
- Express 5.1.0
- PostgreSQL (pg 8.16.3)
- Redis 5.9.0 (caching)
- CORS support
- HTTPS (port 443)

#### server/frontend/ - Web Interface

```
frontend/
└── index.html                 # Single page application
```

**Key Features:**
- Instant page load (removed blocking calls)
- Advanced filtering (address, name, time, assets, networks)
- Cursor-based pagination
- Responsive design

**Performance Improvements:**
- Page load: 25s → under 1s
- Multi-network queries: 19s → 0.09s
- Removed highlightNetworksWithData (23s blocking call)

#### server/services/ - Systemd Services

```
services/
├── backend.services           # Backend API service configuration
└── frontend.services          # Frontend service configuration
```

---

### 3. contract/ - Smart Contracts

Solidity smart contract development environment using Foundry.

```
contract/
├── src/
│   ├── BalanceHelper.sol      # Batch balance query contract
│   └── contractValidator.sol  # Contract validator
│
├── scripts/
│   └── direct-deploy.js       # Deployment script
│
├── lib/                       # Foundry libraries
├── out/                       # Compiled artifacts
├── cache/                     # Build cache
│
├── foundry.toml               # Foundry configuration
├── foundry.lock               # Dependency lock file
└── package.json               # Node.js dependencies
```

**BalanceHelper.sol:**
- Batch balance queries (550M gas limit optimized)
- Deployed on 14 networks
- Dynamic batch sizing (50-1000 addresses)
- Multi-level fallback (full chunk → half chunk → individual calls)

**foundry.toml Configuration:**
- Solidity version: 0.8.19
- EVM version: london (compatibility)
- No PUSH0 (supports older networks)

**Deployed Networks:**
- Ethereum, BSC, Polygon
- Arbitrum, Optimism, Base
- Avalanche, Gnosis, Linea, Scroll, Mantle, opBNB

---

### 4. docs/ - Project Documentation

```
docs/
├── README.md                          # Documentation overview
├── project-structure.md               # This document
├── database-schema.md                 # DB schema documentation
├── materialized-views.md              # Materialized Views usage
├── connection-pool-management.md      # Connection pool management
├── api-performance-optimization.md    # API performance optimization
└── caching-strategy.md                # Caching strategy
```

---

## Data Flow

### Scanning Process

```
1. UnifiedScanner
   ↓
2. Collect Transfer events (Alchemy getLogs)
   ↓
3. Filter and normalize addresses (EIP-55)
   ↓
4. Detect EOA vs Contract
   ↓
5. Verify contracts (Etherscan API)
   ↓
6. Store in PostgreSQL
   ↓
7. FundUpdater (every 6 hours)
   ↓
8. Query token balances (BalanceHelper)
   ↓
9. Get price data (Alchemy Prices API)
   ↓
10. Calculate and update asset values
```

### API Request Flow

```
1. Client request
   ↓
2. Express router (routes/public.js)
   ↓
3. Controller (address.controller.js)
   ↓
4. Service layer (address.service.js)
   ↓
5. Check Redis cache
   ↓
6. PostgreSQL query (using composite indexes)
   ↓
7. Return results (with cursor)
```

---

## Database Structure

### Main Tables

**addresses** - Main data table:
- address (PRIMARY KEY)
- network
- contract_name
- source_code
- deployed (Unix timestamp)
- fund (USD value)
- creator_address
- verified (boolean)

**token_metadata_cache** - Token metadata:
- TTL: 30 days
- Cache key: network + token_address

**token_price_cache** - Token prices:
- TTL: 4 hours
- Uses Alchemy Prices API

### Main Indexes

```sql
-- API sort optimization (composite index)
idx_addresses_api_sort_optimal: (fund DESC, deployed DESC, address ASC)

-- Address prefix search
idx_addresses_address_prefix: address text_pattern_ops

-- Metadata cache
idx_token_metadata_cache_updated

-- Price cache
idx_token_price_cache_updated
```

---

## Tech Stack

### Scanners
- **Language**: Node.js (JavaScript)
- **Libraries**:
  - ethers.js 6.15.0 (blockchain interaction)
  - axios 1.10.0 (HTTP client)
  - pg 8.16.3 (PostgreSQL)
  - dotenv 17.2.1 (environment variables)

### Backend
- **Framework**: Express 5.1.0
- **Database**: PostgreSQL 12+
- **Caching**: Redis 5.9.0
- **Other**: CORS, dotenv

### Contract
- **Framework**: Foundry
- **Language**: Solidity 0.8.19
- **EVM**: London

### External APIs
- **Alchemy API**: RPC, Prices API, Token Metadata
- **Etherscan API**: Source code verification, contract information

---

## Performance Metrics

### Scanner Performance
- **Processing Speed**: ~50,000 addresses/hour per network
- **Efficiency Improvement**: 80%+ (vs individual scanners)
- **DB Optimization**: 455x performance improvement (partial indexes)

### API Performance
- **Page Load**: 25s → under 1s (96% improvement)
- **Multi-network**: 19s → 0.09s (99.5% improvement)
- **Network Counts**: 23s → under 0.1s (cache)
- **Single Network**: Under 0.02s (cache hit)

### Resource Usage
- **RAM**: 4GB+ recommended (8GB+ for parallel processing)
- **Storage**: 50GB+ (DB growth)
- **Network**: Stable internet (RPC and API calls)

---

## Supported Networks

### Active Networks (12)

**Tier 1:**
- Ethereum
- Binance Smart Chain
- Polygon

**Tier 2:**
- Arbitrum
- Optimism
- Base

**Tier 3:**
- Avalanche
- Gnosis
- Linea
- Scroll
- Mantle
- opBNB

### Configured (Can Be Activated, 2)
- Unichain
- Berachain

### Experimental Support
- Sui (separate scanners: SuiTransferScanner, SuiFundUpdater)

---

## Environment Variables

### Required Variables

```bash
# Alchemy API (required for FundUpdater)
ALCHEMY_API_KEY=your_alchemy_key

# Etherscan API
DEFAULT_ETHERSCAN_KEYS=key1,key2,key3

# PostgreSQL
PGHOST=localhost
PGPORT=5432
PGDATABASE=bugchain_indexer
PGUSER=postgres
PGPASSWORD=your_password
```

### Optional Variables

```bash
# Proxy servers
USE_ALCHEMY_PROXY=true
ALCHEMY_PROXY_URL=http://localhost:3002
USE_ETHERSCAN_PROXY=true
ETHERSCAN_PROXY_URL=http://localhost:3000

# Scanner options
TIMEDELAY_HOURS=4
FUNDUPDATEDELAY=7
TIMEOUT_SECONDS=7200
FUND_UPDATE_MAX_BATCH=50000
ALL_FLAG=true
HIGH_FUND_FLAG=true
```

---

## Key Commands

### Run Scanners

```bash
cd scanners

# Single network
NETWORK=ethereum ./run.sh unified

# Parallel execution (all networks)
./run.sh unified parallel

# Asset update
NETWORK=ethereum ./run.sh funds

# Data revalidation
./run.sh revalidate
```

### DB Optimization

```bash
# Daily optimization (fast)
./run.sh db-optimize-fast

# Weekly optimization (VACUUM)
./run.sh db-optimize

# Monthly optimization (large DB)
./run.sh db-optimize-large

# Performance analysis
./run.sh db-analyze
```

### Backend Server

```bash
cd server/backend
npm install
npm start  # HTTPS server (port 443)
```

### Smart Contracts

```bash
cd contract

# Compile
forge build

# Deploy
node scripts/direct-deploy.js
```

---

## Migration History

### Moralis → Alchemy Migration

**Removed:**
- Moralis SDK dependencies
- Moralis-supported networks (Cronos, Moonriver, etc.)

**Added:**
- Alchemy Data API v1 (token balances, metadata)
- Token price caching (7-day TTL)
- Improved address validation with ethers.getAddress()
- Optimized deployment time with Alchemy RPC

**Performance Improvements:**
- Multi-network queries: 99.5% improvement

**Breaking Changes:**
- `MORALIS_API_KEY` → `ALCHEMY_API_KEY`
- FundUpdater requires Alchemy API key

---

## Design Principles

### 1. Modularity
- Reusable components
- Clear separation of concerns
- Independent scanner implementations

### 2. Performance First
- Batch processing and optimization
- Smart caching strategies
- Database index optimization

### 3. Reliability
- Multi-level fallback mechanisms
- Robust error handling
- PostgreSQL Advisory Locks

### 4. Scalability
- Parallel network processing
- Dynamic batch size adjustment
- Horizontal scaling capability

### 5. Data Quality
- EIP-55 checksum validation
- Address normalization
- Automatic data revalidation

---

## Additional Documentation

For detailed information, refer to individual documents in the docs/ folder:

- **database-schema.md**: DB tables and indexes details
- **materialized-views.md**: Materialized Views usage
- **connection-pool-management.md**: Connection pool optimization
- **api-performance-optimization.md**: API performance tuning
- **caching-strategy.md**: Caching strategy and implementation

---

**Last Updated**: 2025-11-01
**Version**: 1.0.0
**Maintainer**: BugChainIndexer Team
