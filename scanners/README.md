# Scanners - Blockchain Analysis Engine

> **High-performance multi-blockchain scanner with unified architecture**

The core analysis engine of BugChainIndexer. Streamlined to 3 core scanners and 4 common modules for maximum efficiency.

## 🏗️ Current Architecture

```
scanners/
├── core/               # Core scanners (3 components)
│   ├── UnifiedScanner.js    # Main pipeline with ERC20 balance checking
│   ├── FundUpdater.js       # Portfolio tracker with advisory locks
│   └── DataRevalidator.js   # Data validation & retagging
├── common/             # Shared library (6 files)
│   ├── core.js              # Core blockchain functions
│   ├── database.js          # PostgreSQL operations
│   ├── Scanner.js           # Base scanner class
│   ├── addressUtils.js      # Address normalization utilities
│   ├── alchemyRpc.js        # Alchemy RPC with Prices API support
│   └── TokenPriceCache.js   # Token price fetching (price only)
├── tokens/             # Token configurations (18 networks, 1,254 tokens)
│   ├── ethereum.json        # 99 tokens with decimals
│   ├── binance.json         # 100 tokens with decimals
│   └── ...                  # 16 more networks
├── config/
│   ├── networks.js     # 18 network configurations
│   └── genesis-timestamps.js # Genesis block timestamps
├── tests/              # Test scripts (13 files)
│   ├── test-all-rpcs.js
│   ├── test-rpc-failover.js
│   ├── test-fundupdater-alchemy.js
│   └── ...
├── utils/              # Database utilities (4 files)
│   ├── db-optimize.js
│   ├── db-optimize-large.js
│   ├── db-cleanup.js
│   └── db-normalize-addresses.js
├── scripts/            # Production scripts (1 file)
│   └── production-db-optimizer.sh
├── cron/               # Automation scripts (11 files)
│   ├── setup-cron.sh
│   ├── cron-unified.sh
│   ├── cron-funds.sh
│   ├── cron-all.sh
│   └── ...
└── run.sh              # Main executor
```

## 🚀 Quick Start

### Basic Operations
```bash
# Main blockchain analysis
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
# Recommended method
NETWORK=ethereum ./run.sh unified
NETWORK=polygon ./run.sh funds
NETWORK=arbitrum ./run.sh revalidate

# Alternative method
./run.sh unified auto ethereum
./run.sh funds auto polygon
```

## ⚙️ Configuration

### 1. Environment Setup
```bash
cp .env.example .env
```

### 2. Required API Keys
```bash
# Etherscan API keys (for all networks)
DEFAULT_ETHERSCAN_KEYS=key1,key2,key3

# Alchemy API key (for reliable RPC calls)
ALCHEMY_API_KEY=your_alchemy_key

# Database configuration
PGHOST=localhost
PGPORT=5432
PGDATABASE=bugchain_indexer
PGUSER=your_user
PGPASSWORD=your_password

# Optional: Proxy servers for high-volume operations
USE_ETHERSCAN_PROXY=false    # Set to true if using Etherscan proxy
ETHERSCAN_PROXY_URL=http://localhost:3000
USE_ALCHEMY_PROXY=false       # Set to true if using Alchemy proxy  
ALCHEMY_PROXY_URL=http://localhost:3002
```

### 3. Optional Settings
```bash
# Scanner timeouts and intervals
TIMEOUT_SECONDS=7200           # Script timeout (2 hours)
FUNDUPDATEDELAY=7              # Days before fund update
FUND_UPDATE_MAX_BATCH=50000    # Max addresses per batch

# Execution flags
ALL_FLAG=true                  # Process all addresses
HIGH_FUND_FLAG=true            # Only high-value addresses (>100k)
```

## 📊 Core Components

### UnifiedScanner
**Main blockchain analysis pipeline**
- Transfer event scanning (ERC-20/721)
- Address discovery and normalization
- EOA vs Contract classification
- Contract verification via Etherscan
- Batch database operations

**Performance**: ~50,000 addresses/hour per network

### FundUpdater
**Portfolio balance tracking and valuation**
- Fetches native + ERC-20 token balances via BalanceHelper contracts
- Calculates total USD portfolio value
- Network-specific balance tracking
- Batch processing with dynamic size adjustment
- Direct on-chain balance queries with fallback support

**Key features**:
- ✅ Multi-network support across 14 chains
- ✅ BalanceHelper contract integration for efficient batch queries
- ✅ Dynamic batch sizing (50-1000 addresses per batch, optimized for 550M gas limit)
- ✅ USD value calculation with price caching
- ✅ Multi-level fallback: full chunk → half chunk → individual calls
- ✅ Token price & metadata caching (7-day & 30-day)

### DataRevalidator
**Data consistency validation**
- Validates and tags existing addresses
- Classifies untagged addresses as Contract/EOA
- Batch processing (20,000 addresses/batch)
- Reuses UnifiedScanner's EOA filtering logic

## 🌐 Supported Networks

### Active Networks (14)
*These networks are enabled in run.sh and actively scanned*

| Network | Chain ID | Alchemy Support | BalanceHelper | Scanner Support |
|---------|----------|----------------|---------------|-----------------|
| Ethereum | 1 | ✅ Yes | ✅ Deployed | ✅ Full |
| Binance Smart Chain | 56 | ✅ Yes | ✅ Deployed | ✅ Full |
| Polygon | 137 | ✅ Yes | ✅ Deployed | ✅ Full |
| Arbitrum | 42161 | ✅ Yes | ✅ Deployed | ✅ Full |
| Optimism | 10 | ✅ Yes | ✅ Deployed | ✅ Full |
| Base | 8453 | ✅ Yes | ✅ Deployed | ✅ Full |
| Avalanche | 43114 | ✅ Yes | ✅ Deployed | ✅ Full |
| Gnosis | 100 | ✅ Yes | ✅ Deployed | ✅ Full |
| Linea | 59144 | ✅ Yes | ✅ Deployed | ✅ Full |
| Scroll | 534352 | ✅ Yes | ✅ Deployed | ✅ Full |
| Mantle | 5000 | ✅ Yes | ✅ Deployed | ✅ Full |
| opBNB | 204 | ✅ Yes | ✅ Deployed | ✅ Full |
| Unichain | 1301 | ✅ Yes | ✅ Deployed | ✅ Full |
| Berachain | 80084 | ✅ Yes | ✅ Deployed | ✅ Full |

#### BalanceHelper Contract Addresses
Efficient batch balance queries for native + ERC-20 tokens:

| Network | Contract Address |
|---------|-----------------|
| Ethereum | `0xF6eDe5F60e6fB769F7571Ad635bF1Db0735a7386` |
| Binance | `0xf481b013532d38227F57f46217B3696F2Ae592c8` |
| Polygon | `0xC55d7D06b3651816ea51700CB91235cd60Dd4d7D` |
| Arbitrum | `0xdD5cFc64f74B2b5A4e80031DDf84597be449E3E3` |
| Optimism | `0x3d2104Da2B23562c47DCAE9EefE5063b6aB5c637` |
| Base | `0xa3ba28ccDDa4Ba986F20E395D41F5bb37F8f900d` |
| Avalanche | `0xa3ba28ccDDa4Ba986F20E395D41F5bb37F8f900d` |
| Gnosis | `0x510E86Be47994b0Fbc9aEF854B83d2f8906F7AD7` |
| Linea | `0x06318Df33cea02503afc45FE65cdEAb8FAb3E20A` |
| Scroll | `0x06318Df33cea02503afc45FE65cdEAb8FAb3E20A` |
| Mantle | `0xeAbB01920C41e1C010ba74628996EEA65Df03550` |
| opBNB | `0xeAbB01920C41e1C010ba74628996EEA65Df03550` |
| Unichain | `0x6F4A97C44669a74Ee6b6EE95D2cD6C4803F6b384` |
| Berachain | `0x6F4A97C44669a74Ee6b6EE95D2cD6C4803F6b384` |

**Note**: All 14 networks have full Alchemy API support and are production-ready.

## 🤖 Automation (Cron)

### Quick Setup
```bash
./cron/setup-cron.sh --auto-setup
```

### Schedule
- **Unified Scanner**: Every 4 hours
- **Fund Updates**: Every 6 hours  
- **Data Validation**: Weekly (Sunday 2 AM)
- **DB Optimization**: Daily (5 AM)
- **Log Cleanup**: Daily (4 AM)

### Manual Testing
```bash
./cron/cron-unified.sh      # Test unified scanner
./cron/cron-funds.sh        # Test fund updater
./cron/cron-revalidate.sh   # Test data validator
```

## 🔧 Database Management

### Optimization Tools
```bash
# Daily use (fast, no VACUUM)
./run.sh db-optimize-fast

# Weekly maintenance (with VACUUM)
./run.sh db-optimize

# Monthly for large DBs (>10GB)
./run.sh db-optimize-large

# Performance analysis
./run.sh db-analyze

# Clean up indexes
./run.sh db-cleanup

# Address normalization
./run.sh db-normalize-addresses
```

### Performance Improvements
- DataRevalidator: 455x faster (23.19s → 0.051s)
- FundUpdater: 17x faster (1.37s → 0.082s)
- UnifiedScanner: 9x faster (1.21s → 0.131s)

## 🧪 Testing

### Available Test Scripts
```bash
# RPC and Network Tests
node tests/test-all-rpcs.js              # Test all RPC endpoints
node tests/test-rpc-failover.js          # Test RPC failover mechanism
node tests/test-rpc-comprehensive.js     # Comprehensive RPC testing
node tests/test-proxy-flags.js           # Test proxy on/off modes

# Scanner Component Tests
node tests/test-datarevalidator.js       # Test data revalidation
node tests/test-datarevalidator-small.js # Small dataset test
node tests/test-datarevalidator-deployed.js # Test deployed field
node tests/test-revalidator-recent.js    # Recent contracts test
node tests/test-revalidator-reprocess.js # Re-processing test

# Fund and Balance Tests
node tests/test-fundupdater-alchemy.js   # Alchemy integration test
node tests/test-last-updated-filter.js   # Last updated filter test

# Address Tests
node tests/test-address-case.js          # Case sensitivity test
node tests/test-eoa-check.js             # EOA vs Contract check
```

### Integration Testing
```bash
# Single network test
NETWORK=ethereum node core/FundUpdater.js

# With specific flags
ALL_FLAG=true NETWORK=ethereum ./run.sh funds
HIGH_FUND_FLAG=true ./run.sh funds-high
```

## 📁 File Structure Summary

### Core Files (Minimal)
- **3 Scanners**: UnifiedScanner, FundUpdater, DataRevalidator
- **6 Common modules**: core, database, Scanner, alchemyRpc, addressUtils, TokenPriceCache
- **2 Config files**: networks, genesis-timestamps

### Support Files
- **13 Test scripts**: Comprehensive testing coverage
- **4 DB utilities**: Optimization and maintenance
- **1 Production script**: DB optimizer
- **11 Cron scripts**: Automation

### Recent Cleanup (2025)
- ❌ Proxy server folders removed from /server directory
- ❌ 3 proxy-related test scripts removed
- ❌ All price aggregation code removed
- ❌ Proxy configuration set to false by default
- ✅ Direct API calls now default behavior

## 🚨 Troubleshooting

### Common Issues
1. **API errors**: Check API keys in .env
2. **Database slow**: Run `./run.sh db-optimize-fast`
3. **RPC failures**: Check network config in `config/networks.js`
4. **Lock file issues**: Remove `/tmp/scanner-*.lock` files

### Performance Tips
- Use `HIGH_FUND_FLAG=true` for testing with fewer addresses
- Adjust `FUND_UPDATE_MAX_BATCH` for memory management
- Run DB optimization regularly
- Monitor logs in `logs/` directory

## 📈 Recent Changes (2025)

### Architecture Improvements
- **BalanceHelper Multi-Address API**: Modified to accept multiple addresses in single call
- **Gas Limit Optimization**: Optimized for Alchemy's 550M gas limit (500-1000 address chunks)
- **Decimals from Cache**: Removed decimals from contract, fetched from metadata cache
- **Unified Alchemy RPC**: All RPC calls now use Alchemy for maximum reliability and consistency
- **Direct Deployment**: All 14 networks deployed with direct RPC deployment script
- **Network Expansion**: Added Unichain and Berachain support

### Performance Optimizations
- BalanceHelper contracts enable batch queries for up to 1000 addresses per call
- Dynamic batch sizing (50-1000) with automatic adjustment based on performance
- Multi-level fallback strategy: full chunk → half chunks → empty maps
- Token price & metadata fetching via Alchemy Data API with 7-day caching
- All RPC calls (getLogs, eth_call, transactions, blocks) use unified Alchemy RPC for consistency
- Deployment time fetching optimized with Alchemy's eth_getTransactionByHash and eth_getBlockByNumber
- Alchemy handles load balancing and failover internally

---

For detailed technical documentation, refer to individual component files and inline documentation.