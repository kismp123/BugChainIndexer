# Scanners - Blockchain Analysis Engine

> **High-performance multi-blockchain scanner with unified architecture**

The core analysis engine of BugChainIndexer. Streamlined to 3 core scanners and 4 common modules for maximum efficiency.

## 🏗️ Current Architecture

```
scanners/
├── core/               # Core scanners (3 components)
│   ├── UnifiedScanner.js    # Main analysis pipeline
│   ├── FundUpdater.js       # Asset balance tracking  
│   └── DataRevalidator.js   # Data validation & retagging
├── common/             # Shared library (6 files)
│   ├── core.js         # Core blockchain functions
│   ├── database.js     # PostgreSQL operations
│   ├── Scanner.js      # Base scanner class
│   ├── addressUtils.js # Address normalization utilities
│   ├── alchemyRpc.js   # Alchemy RPC client
│   └── index.js        # Export hub
├── config/
│   ├── networks.js     # 18 network configurations
│   └── genesis-timestamps.js # Genesis block timestamps
├── tests/              # Test scripts (14 files)
│   ├── test-all-rpcs.js
│   ├── test-rpc-failover.js
│   └── ...
├── utils/              # Database utilities (4 files)
│   ├── db-optimize.js
│   ├── db-optimize-large.js
│   ├── db-cleanup.js
│   └── db-normalize-addresses.js
├── scripts/            # Production scripts (1 file)
│   └── production-db-optimizer.sh
├── cron/               # Automation scripts (10 files)
│   ├── setup-cron.sh
│   ├── cron-unified.sh
│   ├── cron-funds.sh
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
- Fetches native + ERC-20 token balances
- Calculates total USD portfolio value
- Network-specific balance tracking
- Batch processing with rate limiting
- Direct on-chain balance queries

**Key features**:
- ✅ Multi-network support across 18 chains
- ✅ Optimized batch processing
- ✅ USD value calculation
- ✅ Efficient caching system

### DataRevalidator
**Data consistency validation**
- Validates and tags existing addresses
- Classifies untagged addresses as Contract/EOA
- Batch processing (20,000 addresses/batch)
- Reuses UnifiedScanner's EOA filtering logic

## 🌐 Supported Networks

### Active Networks (12)
*These networks are enabled in run.sh and actively scanned*

| Network | Chain ID | Alchemy Support | Scanner Support |
|---------|----------|----------------|-----------------|
| Ethereum | 1 | ✅ Yes | ✅ Full |
| Binance Smart Chain | 56 | ✅ Yes | ✅ Full |
| Polygon | 137 | ✅ Yes | ✅ Full |
| Arbitrum | 42161 | ✅ Yes | ✅ Full |
| Optimism | 10 | ✅ Yes | ✅ Full |
| Base | 8453 | ✅ Yes | ✅ Full |
| Avalanche | 43114 | ✅ Yes | ✅ Full |
| Gnosis | 100 | ✅ Yes | ✅ Full |
| Linea | 59144 | ✅ Yes | ✅ Full |
| Scroll | 534352 | ✅ Yes | ✅ Full |
| Mantle | 5000 | ✅ Yes | ✅ Full |
| opBNB | 204 | ✅ Yes | ✅ Full |

### Disabled Networks (6)
*Configured in networks.js but excluded from active scanning*

| Network | Chain ID | Alchemy Support | Reason |
|---------|----------|----------------|--------|
| Polygon zkEVM | 1101 | ✅ Yes | Operational |
| Arbitrum Nova | 42170 | ✅ Yes | Operational |
| Celo | 42220 | ✅ Yes | Operational |
| Cronos | 25 | ❌ No | No Alchemy support |
| Moonbeam | 1284 | ✅ Yes | Operational |
| Moonriver | 1285 | ❌ No | No Alchemy support |

**Note**: All networks are fully supported by the unified scanner architecture.

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
node tests/test-fundupdater-moralis.js   # Moralis integration test
node tests/test-moralis-single-api.js    # Single API endpoint test
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
- **4 Common modules**: core, database, Scanner, index
- **2 Config files**: networks, genesis-timestamps

### Support Files
- **14 Test scripts**: Comprehensive testing coverage
- **4 DB utilities**: Optimization and maintenance
- **1 Production script**: DB optimizer
- **10 Cron scripts**: Automation

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
- **RPC Management**: Separate clients for getLogs (free RPCs) and contract calls (Alchemy)
- **Proxy Optional**: Direct API calls by default, proxy servers now optional
- **Code Cleanup**: Removed unnecessary proxy infrastructure
- **Test Suite**: Maintained 14 essential test scripts

### Performance Optimizations
- getLogs uses free public RPCs to save Alchemy compute units
- Contract calls use reliable Alchemy API for consistency
- Smart RPC failover with timeout detection
- Batch processing with dynamic chunk sizing

---

For detailed technical documentation, refer to individual component files and inline documentation.