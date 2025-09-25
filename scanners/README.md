# Scanners - Blockchain Analysis Engine

> **High-performance multi-blockchain scanner with unified architecture**

The core analysis engine of BugChainIndexer. Simplified from 15+ files to 4 unified modules and 7 scanners to 3 core components, achieving 50% code reduction and 80%+ efficiency improvements.

## 🏗️ Simplified Architecture

```
scanners/
├── core/               # Core scanners (3 essential components)
│   ├── UnifiedScanner.js    # Main analysis pipeline
│   ├── FundUpdater.js       # Asset price/balance tracking  
│   └── DataRevalidator.js   # Data validation & retagging
├── common/             # Unified library (6 files)
│   ├── core.js         # Consolidated core functions
│   ├── database.js     # PostgreSQL schema & batch operations
│   ├── Scanner.js      # Base scanner class
│   ├── MultiSourcePriceHelper.js  # Multi-source price aggregation
│   ├── TokenDataLoader.js         # Token metadata loader
│   └── index.js        # Export hub (backward compatibility)
├── config/
│   └── networks.js     # 18 network configurations
├── cron/               # Automation scheduling
│   ├── setup-cron.sh   # Automatic cron setup
│   ├── cron-unified.sh # UnifiedScanner automation
│   ├── cron-funds.sh   # FundUpdater automation
│   └── cron-all.sh     # Full suite automation
└── run.sh              # Unified executor (locking, parallelization)
```

## 🚀 Quick Execution

### Basic Operations
```bash
# Main analysis pipeline (recommended)
./run.sh unified

# Asset price/balance updates
./run.sh funds

# Existing data validation (classify empty tag addresses as Contract)
./run.sh datarevalidator

# Full suite (all scanners)
./run.sh all
```

### Network-specific Execution
```bash
# Single network (RECOMMENDED METHOD)
NETWORK=ethereum ./run.sh unified
NETWORK=polygon ./run.sh funds
NETWORK=arbitrum ./run.sh revalidate

# Alternative method with correct parameter order
./run.sh unified auto ethereum
./run.sh funds auto polygon
./run.sh revalidate auto arbitrum
```

### Parallel Processing
```bash
# All networks simultaneously
./run.sh unified parallel

# Sequential processing
./run.sh unified sequential
```

### Direct Script Execution (Development)
```bash
cd scanners
NETWORK=ethereum node core/UnifiedScanner.js
NETWORK=polygon node core/FundUpdater.js
NETWORK=arbitrum node core/DataRevalidator.js
```

## ⚙️ Environment Setup

### 1. Copy Environment Template
```bash
cp .env.example .env
```

### 2. Configure API Keys (Required)
```bash
# Default Etherscan API keys (used by ALL networks for simplicity)
DEFAULT_ETHERSCAN_KEYS=your_key1,your_key2,your_key3

# Price data sources (optional - system will use available sources)
DEFAULT_COINGECKO_KEY=your_coingecko_key  # Optional, fallback option
```

**Notes**: 
- All networks now use `DEFAULT_ETHERSCAN_KEYS` for consistency. Network-specific overrides have been simplified.
- Price data is automatically fetched from multiple free sources (Binance, Kraken, Coinbase, etc.) without requiring API keys.

### 3. Database Configuration
```bash
PGHOST=localhost
PGPORT=5432
PGDATABASE=bugchain_indexer
PGUSER=indexer_user
PGPASSWORD=secure_password
```

### 4. Scanner Settings (Optional)
```bash
TIMEDELAY_HOURS=4              # Activity scan window (default: 4)
FUNDUPDATEDELAY_DAYS=7         # Price cache validity (default: 7)  
TIMEOUT_SECONDS=7200           # Script timeout (default: 7200)
```

## 🔧 Core Components

### UnifiedScanner - Main Analysis Pipeline
**Revolutionary 5-in-1 approach** combining separate operations into one efficient pipeline:

1. **Transfer Event Scanning** - Monitor ERC-20/ERC-721 transfers with immediate address normalization
2. **Address Filtering** - Remove already processed addresses (massive efficiency gain)
3. **EOA Detection** - Contract vs EOA classification via deployment timestamp verification  
4. **Contract Verification** - Source code, ABI, metadata retrieval from Etherscan
5. **Database Storage** - Batch upsert operations with comprehensive indexing

**Performance Metrics:**
- **Processing Speed**: ~50,000 addresses/hour per network
- **Efficiency Gain**: 80%+ improvement over individual scanners
- **Parallel Support**: All 18 networks simultaneously
- **Batch Processing**: 300-1000 addresses per contract call

### FundUpdater - Asset Tracking
- **Multi-Source Price Updates**: Automatic price aggregation from Binance, Kraken, Coinbase, CryptoCompare, and CoinGecko
- **Smart Fallback System**: Automatic failover between price sources for maximum availability
- **Native Balance Tracking**: Batch RPC calls for account balances
- **ERC-20 Balance Queries**: Smart contract integration for token balances
- **Performance**: 17x improvement (1.4s → 0.08s per batch)

### DataRevalidator - Data Validation (New)
**Purpose**: Classify 2,607,048 empty tag addresses as Contract type
- **Simplified Query**: Process only non-EOA addresses without Contract tags
- **Large Batch Processing**: 20,000 addresses per batch
- **UnifiedScanner Logic Reuse**: `performEOAFiltering` method integration
- **Performance**: 455x improvement (23.19s → 0.051s per batch)

## 🌐 Supported Networks (18 Total)

| Network | Chain ID | Explorer API | Smart Contracts |
|---------|----------|--------------|-----------------|
| Ethereum | 1 | Etherscan | ✅ Deployed |
| Binance Smart Chain | 56 | BSCScan | ✅ Deployed |
| Polygon | 137 | PolygonScan | ✅ Deployed |
| Arbitrum | 42161 | Arbiscan | ✅ Deployed |
| Optimism | 10 | Optimism Etherscan | ✅ Deployed |
| Base | 8453 | BaseScan | ✅ Deployed |
| Avalanche | 43114 | SnowTrace | ✅ Deployed |
| Gnosis Chain | 100 | GnosisScan | ✅ Deployed |
| Linea | 59144 | LineaScan | ✅ Deployed |
| Scroll | 534352 | ScrollScan | ✅ Deployed |
| Mantle | 5000 | MantleScan | ✅ Deployed |
| opBNB | 204 | opBNBScan | ✅ Deployed |
| Polygon zkEVM | 1101 | Polygon zkEVM | ❌ Not Working |
| Arbitrum Nova | 42170 | Nova Arbiscan | ❌ Not Working |
| Celo | 42220 | CeloScan | ❌ Not Working |
| Cronos | 25 | CronoScan | ❌ Not Working |
| Moonbeam | 1284 | Moonscan | ❌ Not Working |
| Moonriver | 1285 | Moonscan | ❌ Not Working |

## 🤖 Automation Setup

### Quick Setup (Recommended)
```bash
cd scanners
./cron/setup-cron.sh --auto-setup
```

**Automated Schedule:**
- **Unified Analysis**: Every 4 hours (comprehensive pipeline)
- **Fund Updates**: Every 6 hours (asset prices and balances)  
- **Data Validation**: Weekly Sundays 2 AM (tag verification)
- **DB Daily Optimization**: Daily 5 AM (fast optimization)
- **DB Regular Maintenance**: Weekly Sundays 3 AM (with VACUUM)
- **DB Large Optimization**: Monthly 1st day 1 AM (10GB+ optimization)
- **Log Cleanup**: Daily 4 AM (remove logs >3 days)

### Manual Setup
```bash
# Custom options with interactive setup
./cron/setup-cron.sh --interactive

# View comprehensive guide
cat cron/CRON_SETUP.md
```

### Manual Cron Testing
```bash
# Scanner automation tests
./cron/cron-unified.sh                 # Test unified pipeline cron
./cron/cron-funds.sh                   # Test fund update cron  
./cron/cron-revalidate.sh              # Test data validation cron
./cron/cron-all.sh                     # Test full suite cron

# Database maintenance tests
./cron/cron-db-daily.sh                # Daily DB optimization
./cron/cron-db-maintenance.sh          # Weekly DB maintenance
./cron/cron-db-large-optimize.sh       # Monthly large DB optimization
./cron/cron-cleanup.sh                 # Log cleanup
```

## 🔍 UnifiedScanner Deep Dive

### Step-by-Step Process
1. **Transfer Event Scanning (Enhanced)**
   - Monitor recent blocks for ERC-20/ERC-721 transfer events
   - **Extract 3 address types with immediate normalization**:
     - `log.address`: Token contract that emitted the event
     - `log.topics[1]`: Transfer event from address 
     - `log.topics[2]`: Transfer event to address
   - Apply `normalizeAddress()` to all addresses (lowercase conversion)
   - Configurable time window (TIMEDELAY_HOURS)

2. **Address Filtering**  
   - Remove already processed addresses from database
   - Massive efficiency improvement (often 70-90% reduction)
   - Prevent duplicate processing

3. **EOA Detection**
   - Batch contract calls to determine contract vs EOA status
   - Deployment timestamp verification for accuracy
   - Handle edge cases where EOA becomes contract

4. **Contract Verification**
   - Retrieve source code, ABI, metadata from Etherscan
   - Parallel processing with API key rotation
   - Handle rate limiting and retry logic

5. **Database Storage**
   - Batch upsert operations for maximum efficiency  
   - Comprehensive indexing for fast queries
   - Maintain data consistency across networks

### Performance Metrics
- **Processing Speed**: ~50,000 addresses/hour per network
- **Efficiency Improvement**: 80%+ improvement over individual scanners
- **Resource Usage**: Optimized memory and CPU utilization
- **Scalability**: Unlimited network addition support

## 📊 Database Optimization System (New - September 2025)

### Revolutionary Performance Improvements
BugChainIndexer's database optimization system addresses performance issues with large datasets (10GB+):

#### Achieved Results
- **DataRevalidator**: 23.19s → 0.051s (455x improvement)
- **FundUpdater**: 1.373s → 0.082s (17x improvement)  
- **UnifiedScanner**: 1.212s → 0.131s (9x improvement)
- **Storage Space**: 4.1GB unnecessary indexes removed

#### Core Optimization Techniques
1. **Partial Indexes**
   ```sql
   -- Index only addresses missing tags
   CREATE INDEX idx_addresses_missing_tags ON addresses(network, last_updated) 
   WHERE (tags IS NULL OR tags = '{}' OR NOT ('Contract' = ANY(tags)) AND NOT ('EOA' = ANY(tags)));
   ```

2. **Composite Indexes**
   ```sql
   -- Combined network and update time indexes
   CREATE INDEX idx_addresses_network_updated ON addresses(network, last_fund_updated) 
   WHERE last_fund_updated < 1736380800;
   ```

3. **Intelligent VACUUM Scheduling**
   - Selective VACUUM execution based on dead tuple ratio
   - Staged optimization for large datasets

### Optimization Tools Usage

#### Daily Use (Recommended)
```bash
./run.sh db-optimize-fast    # Fast optimization (skip VACUUM)
```

#### Weekly Maintenance
```bash
./run.sh db-optimize         # Full optimization (with VACUUM)
```

#### Monthly Large Optimization
```bash
./run.sh db-optimize-large   # For 10GB+ databases
```

#### Problem Diagnosis
```bash
./run.sh db-analyze          # Performance analysis & recommendations
```

### Automated Monitoring
All optimization tools provide real-time performance metrics:
- Query execution time measurement
- Index usage statistics
- Storage space utilization analysis
- Optimization recommendations generation

### Cron-based Automatic Maintenance
```bash
# Auto-configured with setup-cron.sh --auto-setup
0 5 * * *   cron-db-daily.sh           # Daily fast optimization
0 3 * * 0   cron-db-maintenance.sh     # Weekly full maintenance  
0 1 1 * *   cron-db-large-optimize.sh  # Monthly large optimization
```

## 🧪 Testing Strategy

### Scanner Testing (Simplified)
```bash
# Direct script execution for testing
cd scanners
NETWORK=ethereum node core/UnifiedScanner.js
NETWORK=polygon node core/FundUpdater.js  
NETWORK=arbitrum node core/DataRevalidator.js

# Single network testing
./run.sh unified auto polygon
./run.sh datarevalidator auto ethereum

# Cron testing
./cron/cron-unified.sh
./cron/cron-revalidate.sh

# Database optimization testing
./run.sh db-analyze                  # Performance analysis only
./run.sh db-optimize-fast           # Fast optimization test
```

### Development Testing
```bash
# Environment variable test
node -e "
require('dotenv').config();
const { NETWORKS, CONFIG } = require('./config/networks.js');
console.log('Loaded networks:', Object.keys(NETWORKS).length);
console.log('API keys configured:', CONFIG.etherscanApiKeys.length);
"

# Configuration validation
node -e "
const Scanner = require('./common/Scanner.js');
const scanner = new Scanner('ethereum', 'test-mode');
console.log('Scanner configured:', scanner.config ? 'Yes' : 'No');
"
```

## 🚨 Troubleshooting Guide

### Common Scanner Issues
- **RPC Failures**: Check RPC URLs in `config/networks.js`, ensure failover endpoints
- **API Rate Limiting**: Verify Etherscan API keys, check rotation logic
- **Database Connection**: Validate PostgreSQL credentials and network access
- **Lock File Issues**: Remove `.lock` files if scripts won't start

### Performance Optimization
- **Slow Processing**: Increase batch sizes in `common/core.js`
- **Memory Issues**: Reduce TIMEDELAY_HOURS for smaller processing windows
- **Database Performance**: Use optimization tools:
  - `./run.sh db-optimize-fast` - Daily fast optimization
  - `./run.sh db-cleanup` - Remove unnecessary indexes
  - `./run.sh db-optimize-large` - Large database specific optimization
  - `./run.sh db-analyze` - Performance analysis and diagnosis
- **Query Performance**: Leverage partial indexes for 455x performance gains

### Database Issues
- **Connection Errors**: Ensure PostgreSQL service is running
- **Slow Queries**: Run optimization tools and check index usage
- **Storage Issues**: Clean up old logs and optimize indexes

## 📈 Latest Improvements (September 2025)

### 🚀 Common Folder Major Consolidation
- **Previous**: 15+ individual files → **Current**: 4 consolidated files
- **50% file reduction**: Dramatically improved maintainability
- **Backward compatibility guaranteed**: All existing import patterns supported
- **Duplicate code removed**: ~20+ unused functions eliminated

### 🎯 Core Scanner Simplification
- **Previous**: 7 scanners → **Current**: 3 core scanners
- **Removed scanners**: DeploymentFixer, ContractNameUpdater, ContractDeployedUpdater
- **DataRevalidator newly added**: Dedicated existing data validation script

### ⚡ Performance Optimization
- **DataRevalidator batch size**: 50 → 20,000 addresses
- **UnifiedScanner integration**: Direct `performEOAFiltering` method reuse
- **Database query optimization**: Tag-based priority queries
- **Database performance revolution**:
  - DataRevalidator: 455x performance improvement (23.19s → 0.051s)
  - FundUpdater: 17x performance improvement (1.37s → 0.082s)
  - UnifiedScanner: 9x performance improvement (1.21s → 0.131s)
  - 4.1GB unnecessary indexes removed for storage optimization
  - Query optimization using partial and composite indexes

### 🛠️ New Database Tools
- **Automated optimization**: Daily/weekly/monthly automatic maintenance schedules
- **Large-scale support**: Specialized optimization for 10GB+ databases
- **Real-time monitoring**: Query performance analysis and index usage tracking
- **Intelligent VACUUM**: Selective maintenance based on data state

### 🔤 Address Normalization System
- **UnifiedScanner enhancement**: Immediate address normalization at log extraction
- **Comprehensive address collection**: Include contract, from, to addresses
- **Automatic deduplication**: Resolve duplicates caused by case differences
- **Normalization verification tools**: `db-normalize-addresses.js` script added
- **Batch normalization**: Completed normalization of 1,764,173 mixed-case addresses in existing database

---

This document provides a comprehensive guide for working with the BugChainIndexer scanner system. For additional technical details, refer to component-specific documentation and the `docs/` directory.