# BugChainIndexer

> **Multi-blockchain contract analysis and indexing system**

BugChainIndexer is a comprehensive blockchain analysis platform that monitors, analyzes, and indexes contract data across 12 blockchain networks. The system uses Alchemy API for reliable data access and features an optimized backend delivering sub-second response times.

## ✨ Key Features

### 🔍 **Multi-Chain Analysis**
- **12 Blockchain Networks**: Ethereum, Binance Smart Chain, Polygon, Arbitrum, Optimism, Base, Avalanche, Gnosis, Linea, Scroll, Mantle, opBNB
- **Unified Processing**: Single codebase handles all networks with consistent data structures
- **Parallel Execution**: Process multiple networks simultaneously for maximum efficiency

### 🚀 **High-Performance Scanning**
- **50,000+ addresses/hour**: Revolutionary processing speed per network
- **5-in-1 Pipeline**: Transfer events → Address filtering → EOA detection → Contract verification → Database storage
- **Smart Batching**: Dynamic batch sizing with 300-1000 addresses per contract call
- **80%+ Efficiency Gain**: Massive improvement over traditional individual scanners
- **Dual RPC Architecture**: Separate clients for getLogs (regular RPC) and eth_call (Alchemy)

### 💰 **Asset & Fund Tracking**
- **Alchemy API Integration**: Token balances and portfolio data via Alchemy Data API v1
- **Token Metadata Cache**: 30-day cache for symbol, name, decimals, logo
- **Price Cache**: 4-hour cache for token prices with USD valuation
- **Multi-Network Support**: Portfolio tracking across 12 blockchain networks
- **Whitelisted Tokens**: Configurable token filtering per network

### 🗄️ **Advanced Database Management**
- **PostgreSQL Optimization**: 455x performance improvement with partial indexes
- **Smart Caching**: 4-hour network counts cache eliminates expensive queries
- **Query Optimization**: Intelligent count queries with fast path for network filters
- **Automated Maintenance**: Daily/weekly/monthly optimization schedules
- **Real-time Monitoring**: Query performance analysis and recommendations

### 🌐 **Fast Backend API**
- **Sub-second Response**: Page loads in <1s (96% improvement from 25s)
- **Optimized Queries**: Composite indexes for fund/deployed/address sorting
- **Smart Count Strategy**:
  * Fast path: Use cached network counts (0.09s)
  * Skip count: Avoid full scans for 10+ networks
  * Exact count: Run COUNT(*) only when needed
- **REST API**: Clean endpoints for filtering, statistics, and network counts

### 🤖 **Intelligent Automation**
- **Cron Integration**: Fully automated scanning with customizable schedules
- **Lock Management**: Prevents duplicate processes with file-based locking
- **Error Recovery**: Robust error handling with automatic retries
- **Log Management**: Comprehensive logging with automatic cleanup

### 📊 **Data Validation & Quality**
- **EIP-55 Checksum**: Uses ethers.getAddress() for proper address validation
- **Address Normalization**: Consistent lowercase formatting with checksum verification
- **Contract Classification**: Automatic EOA vs Contract detection
- **Source Code Verification**: Etherscan API integration for contract metadata
- **Duplicate Prevention**: Advanced deduplication and data integrity checks

### 🔧 **Developer-Friendly Tools**
- **Modular Architecture**: Clean separation of concerns with reusable components
- **Comprehensive Testing**: Built-in test suite for Alchemy API integration
- **Flexible Configuration**: Environment-based settings with intelligent defaults
- **API Proxy Support**: Centralized API management with parallel processing

## 🏗️ Architecture

```
BugChainIndexer/
├── scanners/                      # Core blockchain analysis engine
│   ├── common/                    # Shared utilities and base classes
│   │   ├── TokenMetadataCache.js  # 30-day token metadata cache
│   │   ├── TokenPriceCache.js     # 4-hour token price cache
│   │   ├── Scanner.js             # Base scanner with dual RPC clients
│   │   └── addressUtils.js        # EIP-55 address validation
│   ├── core/                      # Scanner implementations
│   │   ├── UnifiedScanner.js      # Main analysis pipeline
│   │   ├── FundUpdater.js         # Alchemy-based portfolio tracker
│   │   └── DataRevalidator.js     # Data validation and tagging
│   └── config/
│       └── networks.js            # Network configurations (12 active)
├── server/
│   ├── backend/                   # REST API backend
│   │   └── services/
│   │       └── address.service.js # Optimized query service
│   ├── frontend/                  # Web interface
│   │   └── index.html             # Optimized UI (no blocking calls)
│   └── etherscan-proxy-server/    # Centralized Etherscan API proxy
└── docs/                          # Documentation
```

## 🚀 Quick Start

### Prerequisites

- Node.js (v16+)
- PostgreSQL (v12+)
- Alchemy API key
- Etherscan API keys for blockchain explorers

### 1. Clone and Install

```bash
git clone <repository-url>
cd BugChainIndexer/scanners
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys and database settings
```

**Required Environment Variables:**
```bash
# Alchemy API (required for FundUpdater)
ALCHEMY_API_KEY=your_alchemy_key

# Etherscan API keys
DEFAULT_ETHERSCAN_KEYS=key1,key2,key3

# Database
PGDATABASE=bugchain_indexer
PGUSER=postgres
PGPASSWORD=your_password
```

### 3. Set up Database

```bash
# BugChainIndexer automatically creates the database!
# Just ensure PostgreSQL is running and configure .env

# The system will automatically create:
# - addresses table with optimized indexes
# - token_metadata_cache table (30-day TTL)
# - token_price_cache table (4-hour TTL)
```

### 4. Run Scanner

```bash
# Analyze single network (RECOMMENDED METHOD)
NETWORK=ethereum ./run.sh unified

# Alternative method with correct parameter order
./run.sh unified auto ethereum

# Analyze all networks in parallel
./run.sh unified parallel

# Update asset prices and balances (uses Alchemy API)
NETWORK=ethereum ./run.sh funds

# Validate existing data
./run.sh revalidate
```

### 5. Start Backend API

```bash
cd server/backend
npm install
npm start  # Starts HTTPS server on port 443
```

## 🌐 Supported Networks

**12 Active Networks:**

✅ **Fully Operational:**
- Ethereum, Binance Smart Chain, Polygon
- Arbitrum, Optimism, Base
- Avalanche, Gnosis, Linea
- Scroll, Mantle, opBNB

⚠️ **Disabled Networks** (available in config but not in active list):
- Celo, Polygon zkEVM, Arbitrum Nova
- Cronos, Moonbeam, Moonriver

*Note: These networks are defined in networks.js but excluded from the active NETWORKS array in run.sh for operational reasons.*

## 📊 Performance Metrics

### Frontend Performance
- **Page Load**: 25s → <1s (96% improvement)
- **Multi-network Query**: 19s → 0.09s (99.5% improvement)
- **Network Counts API**: 23s → <0.1s with 4-hour cache
- **Single Network Query**: <0.02s with cache hit

### Scanner Performance
- **Processing Speed**: ~50,000 addresses/hour per network
- **Efficiency Gain**: 80%+ improvement over individual scanners
- **Database Optimization**: 455x performance boost in data validation
- **Architecture**: Unified 5-in-1 analysis pipeline

### Backend Optimizations
- **Composite Index**: (fund DESC, deployed DESC, address ASC) for fast sorting
- **Cached Counts**: 4-hour TTL eliminates 23s GROUP BY queries
- **Smart Query Strategy**: Fast path uses cache, skip count for 10+ networks
- **No Blocking Calls**: Removed highlightNetworksWithData from frontend

## 🏭 Components

### Scanners
High-performance blockchain analysis engine with Alchemy API integration.
- **UnifiedScanner**: Main analysis pipeline (transfer events → contract verification)
- **FundUpdater**: Alchemy-based portfolio tracking with token metadata/price caching
- **DataRevalidator**: Existing data validation and tagging

### Backend Server
Express.js REST API with PostgreSQL database.
- Optimized queries with composite indexes
- 4-hour network counts cache
- Advanced filtering and pagination
- Real-time contract and address data

### Frontend
Fast web interface with no blocking API calls.
- Instant page load (removed 23s highlightNetworksWithData)
- Advanced filtering (address, name, time, fund, networks)
- Pagination with cursor-based navigation

### API Proxy Server
High-performance centralized Etherscan API management.
- **Parallel Processing**: 4 concurrent requests with multiple API keys
- **Address Normalization**: Automatic format validation and correction
- **Per-Key Rate Limiting**: Independent 5 req/s limit per API key

## 🔧 Configuration

### API Keys Required

```bash
# Alchemy API (required for FundUpdater)
ALCHEMY_API_KEY=your_alchemy_key

# Optional: Use Alchemy proxy for better performance
USE_ALCHEMY_PROXY=true
ALCHEMY_PROXY_URL=http://localhost:3002

# Blockchain explorer APIs (required for scanners)
DEFAULT_ETHERSCAN_KEYS=key1,key2,key3

# Etherscan proxy server
USE_ETHERSCAN_PROXY=true
ETHERSCAN_PROXY_URL=http://localhost:3000
```

### Database Settings

```bash
PGHOST=localhost
PGPORT=5432
PGDATABASE=bugchain_indexer
PGUSER=indexer_user
PGPASSWORD=secure_password
```

### Scanner Options

```bash
TIMEDELAY_HOURS=4              # Analysis time window
FUNDUPDATEDELAY=7              # Fund update delay (days)
TIMEOUT_SECONDS=7200           # Script timeout

# FundUpdater options
FUND_UPDATE_MAX_BATCH=50000    # Max addresses per batch
ALL_FLAG=true                  # Update all addresses (ignore delay)
HIGH_FUND_FLAG=true            # Target high-value addresses (100K+)
```

## 🤖 Automation

Set up automated scanning with cron:

```bash
cd scanners/cron
./setup-cron.sh --auto-setup
```

**Default Schedule:**
- **Unified Analysis**: Every 4 hours
- **Fund Updates**: Every 6 hours
- **Data Validation**: Weekly (Sundays 2 AM)
- **Database Optimization**: Daily maintenance

## 📈 Database Optimization

Built-in database optimization tools for high-performance operations:

```bash
# Daily optimization (fast)
./run.sh db-optimize-fast

# Weekly maintenance (with VACUUM)
./run.sh db-optimize

# Monthly large database optimization (10GB+)
./run.sh db-optimize-large

# Performance analysis
./run.sh db-analyze
```

**Key Indexes Created:**
- `idx_addresses_api_sort_optimal`: (fund DESC, deployed DESC, address ASC)
- `idx_addresses_address_prefix`: Address prefix search with text_pattern_ops
- `idx_token_metadata_cache_updated`: Metadata cache lookup
- `idx_token_price_cache_updated`: Price cache lookup

## 🔍 API Usage

### Backend API Endpoints

**Base URL:** `https://api.bugchain.xyz`

```bash
# Get addresses with filtering
GET /getAddressesByFilter?limit=50&includeTotal=true&networks=ethereum,polygon

# Query Parameters:
# - limit: Results per page (1-200, default 50)
# - includeTotal: Calculate total count (default false)
# - networks: Comma-separated network list
# - address: Address search (exact or prefix)
# - contractName: Contract name search
# - deployedFrom/deployedTo: Unix timestamp range
# - fundFrom/fundTo: USD value range
# - cursor: Pagination cursor (from previous response)

# Get contract count
GET /getContractCount

# Get network statistics (4-hour cache)
GET /networkCounts
```

### Performance Tips
- Use `includeTotal=false` for fastest queries (0.09s)
- With 10+ networks, totalCount is automatically skipped
- Network-only filters use fast cache path (0.09s vs 19s)
- Address/name filters trigger exact count (slower but accurate)

## 📋 Requirements

### System Requirements
- **RAM**: 4GB+ (8GB+ recommended for parallel processing)
- **Storage**: 50GB+ for database (grows with usage)
- **Network**: Stable internet for RPC and API calls

### API Limits
- **Alchemy API**: Varies by plan (Growth: 330 CU/sec)
- **Etherscan**: 5 calls/second (free), 10k calls/day
- **RPC**: Varies by provider (failover supported)

## 🛠️ Development

### Adding New Networks

1. Check Alchemy API support for the network
2. Add network config to `scanners/config/networks.js`:
```javascript
{
  network: 'newchain',
  rpc: ['https://rpc.newchain.com'],
  etherscanUrl: 'https://api.newchain.com/api',
  alchemyNetwork: 'newchain-mainnet',  // Required for FundUpdater
  contractValidator: '0x...'  // Optional
}
```
3. Add tokens to `scanners/tokens/newchain.json` (for FundUpdater)
4. Test with `NETWORK=newchain ./run.sh unified`

### Testing

```bash
# Test Alchemy API integration
cd scanners
node tests/test-fundupdater-alchemy.js

# Test scanner functionality
NETWORK=ethereum ./run.sh unified auto
```

## 🔄 Migration Notes

### Moralis → Alchemy Migration
This version has migrated from Moralis to Alchemy API:
- **Removed**: Moralis SDK dependencies
- **Added**: Alchemy Data API v1 for token balances
- **Added**: Token metadata and price caching (30-day and 4-hour TTL)
- **Improved**: Address validation with ethers.getAddress()
- **Performance**: 99.5% improvement in multi-network queries

### Breaking Changes
- Networks without Alchemy support removed (Cronos, Moonriver, etc.)
- `MORALIS_API_KEY` replaced with `ALCHEMY_API_KEY`
- FundUpdater now requires Alchemy API key

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📞 Support

- **Documentation**: See individual component READMEs
- **Performance**: Built-in monitoring and optimization tools
- **API Status**: Check Alchemy and Etherscan status pages

---

**Built for scale. Optimized for performance. Ready for production.**