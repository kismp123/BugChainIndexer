# BugChainIndexer Setup Guide

Complete setup guide for BugChainIndexer - a multi-blockchain analysis and indexing system.

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v16 or higher)
- **PostgreSQL** (v12 or higher) 
- **Git**
- **API Keys** for blockchain explorers
- **RPC Endpoints** for target networks

### 1. Installation

```bash
# Clone repository
git clone <your-repository-url>
cd BugChainIndexer

# Install scanner dependencies
cd scanners
npm install

# Install server dependencies (optional)
cd ../server/backend
npm install
```

### 2. Environment Configuration

```bash
# Copy environment template
cd ../../scanners
cp .env.example .env
```

Edit the `.env` file with your configuration:

```bash
# ================================
# API KEYS (REQUIRED)
# ================================

# Default Etherscan API keys (comma-separated for failover)
DEFAULT_ETHERSCAN_KEYS=your_key1,your_key2,your_key3

# ================================
# DATABASE (PostgreSQL)
# ================================
PGHOST=localhost
PGPORT=5432
PGDATABASE=bugchain_indexer
PGUSER=indexer_user
PGPASSWORD=secure_password

# ================================
# SCANNER SETTINGS (Optional)
# ================================
TIMEDELAY_HOURS=4              # Analysis time window
FUNDUPDATEDELAY_DAYS=7         # Price cache duration  
TIMEOUT_SECONDS=7200           # Script timeout
```

## 🔑 API Key Setup

### Required API Keys

#### 1. Etherscan API Keys
**Free tier available** - Required for contract verification

1. Visit [Etherscan.io](https://etherscan.io/apis)
2. Create an account
3. Generate API key from "API Keys" section
4. Repeat for multiple keys (recommended for rate limiting)

**Network-specific explorers:**
- **Ethereum**: [Etherscan.io](https://etherscan.io/apis)
- **BSC**: [BSCScan.com](https://bscscan.com/apis)
- **Polygon**: [PolygonScan.com](https://polygonscan.com/apis)
- **Arbitrum**: [Arbiscan.io](https://arbiscan.io/apis)
- **Optimism**: [Optimistic Etherscan](https://optimistic.etherscan.io/apis)
- **Base**: [BaseScan.org](https://basescan.org/apis)

### API Key Configuration

**Important**: All networks now use the `DEFAULT_ETHERSCAN_KEYS` for simplicity and consistency.

The system automatically uses your default Etherscan API keys for all supported networks:
- Ethereum, BSC, Polygon, Arbitrum, Optimism, Base, Avalanche, and others

**Note**: Network-specific API key overrides have been simplified. All networks now use the default keys specified in `DEFAULT_ETHERSCAN_KEYS`.

## 🗄️ Database Setup

### PostgreSQL Installation

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### macOS
```bash
brew install postgresql
brew services start postgresql
```

#### Windows
Download from [PostgreSQL.org](https://postgresql.org/download/windows/)

### Database Configuration

**BugChainIndexer automatically creates the database if it doesn't exist!**

Just ensure PostgreSQL is running and update your `.env` file:

```bash
PGHOST=localhost
PGPORT=5432
PGDATABASE=bugchain_indexer
PGUSER=postgres          # or your PostgreSQL user
PGPASSWORD=              # your PostgreSQL password
```

**Manual Database Creation (Optional):**
If you prefer to create the database manually:

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE bugchain_indexer;
CREATE USER indexer_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE bugchain_indexer TO indexer_user;

# Exit psql
\q
```

**Note:** The scanner will automatically:
1. Check if the database exists
2. Create it if missing
3. Set up the required schema
4. Start processing blockchain data

## 🚀 First Run

### Test Configuration
```bash
cd scanners

# Test environment loading
node -e "
require('dotenv').config();
const { NETWORKS, CONFIG } = require('./config/networks.js');
console.log('✅ Configuration loaded');
console.log('Networks:', Object.keys(NETWORKS).length);
console.log('API Keys:', CONFIG.etherscanApiKeys.length);
"
```

### Run Single Network Analysis
```bash
# Analyze Ethereum (recommended for first test)
NETWORK=ethereum ./run.sh unified

# Alternative method with correct parameter order
./run.sh unified auto ethereum

# Check results
echo "SELECT COUNT(*) FROM addresses WHERE network='ethereum';" | psql $PGDATABASE
```

### Run Multiple Networks
```bash
# Analyze specific networks (RECOMMENDED METHOD)
NETWORK=polygon ./run.sh unified
NETWORK=arbitrum ./run.sh unified

# Alternative method with correct parameter order
./run.sh unified auto polygon
./run.sh unified auto arbitrum

# Analyze all networks in parallel
./run.sh unified parallel
```

## 🤖 Automation Setup

### Automatic Cron Setup (Recommended)
```bash
cd scanners
./cron/setup-cron.sh --auto-setup
```

This creates the following schedule:
- **Unified Analysis**: Every 4 hours
- **Fund Updates**: Every 6 hours
- **Data Validation**: Weekly (Sunday 2 AM)
- **Database Optimization**: Daily maintenance

### Manual Cron Setup
```bash
# Interactive setup with custom options
./cron/setup-cron.sh --interactive

# View current cron jobs
crontab -l
```

### Manual Cron Testing
```bash
# Test individual cron scripts
./cron/cron-unified.sh      # Test unified pipeline
./cron/cron-funds.sh        # Test fund updates
./cron/cron-revalidate.sh   # Test data validation
```

## 🔧 Advanced Configuration

### Custom RPC Endpoints
Override default RPC URLs in `.env`:

```bash
# Custom RPC URLs (comma-separated for failover)
ETHEREUM_RPC_URL=https://your-rpc1.com,https://your-rpc2.com
POLYGON_RPC_URL=https://your-polygon-rpc.com
ARBITRUM_RPC_URL=https://your-arbitrum-rpc.com
```

### Performance Tuning
```bash
# Adjust processing windows
TIMEDELAY_HOURS=8              # Larger window = more addresses per run
FUNDUPDATEDELAY_DAYS=3         # More frequent price updates

# Adjust timeouts
TIMEOUT_SECONDS=10800          # 3 hours for large datasets
```

### Database Optimization
```bash
# Daily fast optimization
./run.sh db-optimize-fast

# Weekly full maintenance  
./run.sh db-optimize

# Monthly large database optimization (10GB+)
./run.sh db-optimize-large

# Performance analysis
./run.sh db-analyze
```

## 🖥️ Server Setup (Optional)

### Backend API Server

```bash
cd server/backend

# Configure environment
cp .env_example .env
# Edit with your database settings

# Install dependencies
npm install

# Start development server
npm run dev

# Start production server (with PM2)
npm start
```

### Frontend (Optional)
The server includes a simple frontend at `/server/frontend/index.html`

Access at: `http://localhost:8000`

## 🧪 Testing & Validation

### Configuration Test
```bash
# Test all components load correctly
node -e "
const Scanner = require('./common/Scanner.js');
const scanner = new Scanner('ethereum', 'test-mode');
console.log('✅ Scanner initialized');
console.log('Config:', scanner.config ? 'Loaded' : 'Failed');
"
```

### Database Connection Test
```bash
# Test PostgreSQL connection
pg_isready -h $PGHOST -p $PGPORT
echo "SELECT version();" | psql $PGDATABASE
```

### API Keys Test
```bash
# Test Etherscan API (replace with your key)
curl "https://api.etherscan.io/api?module=account&action=balance&address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&tag=latest&apikey=YOUR_KEY"

# Should return: {"status":"1","message":"OK","result":"..."}
```

### End-to-End Test
```bash
# Run short test with 30 second timeout (from scanners directory)
cd scanners
NETWORK=ethereum TIMEOUT_SECONDS=30 node core/UnifiedScanner.js

# Or use the run script with timeout
NETWORK=ethereum ./run.sh unified
```

## 🚨 Troubleshooting

### Common Issues

#### "No API keys configured"
- Check `.env` file exists in scanners directory
- Verify `DEFAULT_ETHERSCAN_KEYS` is set
- Ensure API keys are comma-separated without spaces

#### "Database connection failed"
- Verify PostgreSQL is running: `systemctl status postgresql`
- Test connection: `psql -h $PGHOST -p $PGPORT -U $PGUSER $PGDATABASE`
- Check firewall settings

#### "RPC connection failed"  
- Test RPC endpoint: `curl -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' YOUR_RPC_URL`
- Try different RPC provider
- Check network connectivity

#### "Rate limit exceeded"
- Add more API keys to rotation
- Reduce processing frequency
- Upgrade to paid API tier

#### Lock file issues
```bash
# Remove stale lock files
rm scanners/*.lock
```

### Performance Issues

#### Slow processing
- Increase batch sizes in `common/core.js`
- Use faster RPC endpoints
- Add more API keys for rotation

#### High memory usage
- Reduce `TIMEDELAY_HOURS` for smaller batches
- Increase `TIMEOUT_SECONDS` for larger datasets
- Monitor with `htop` or `top`

#### Database performance
- Run optimization: `./run.sh db-optimize`
- Check disk space: `df -h`
- Monitor queries: `SELECT * FROM pg_stat_activity;`

## 📊 Monitoring & Maintenance

### Log Monitoring
```bash
# View recent logs
tail -f scanners/logs/unified-scanner.log
tail -f scanners/logs/fund-updater.log

# Clean old logs
./cron/cron-cleanup.sh
```

### Database Monitoring
```bash
# Check database size
SELECT pg_size_pretty(pg_database_size('bugchain_indexer'));

# Check table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_stat_user_tables 
ORDER BY pg_total_relation_size(relid) DESC;

# Check recent activity
SELECT COUNT(*), network FROM addresses 
WHERE last_updated > EXTRACT(EPOCH FROM NOW() - INTERVAL '1 hour')
GROUP BY network;
```

### System Health Check
```bash
# Check all services
systemctl status postgresql
ps aux | grep node

# Check disk usage
df -h

# Check memory usage
free -h
```

## 🔄 Updates & Maintenance

### Code Updates
```bash
git pull origin main
cd scanners && npm install
cd ../server/backend && npm install
```

### Database Schema Updates
```bash
# Schema updates are automatic on first run
# Manual schema check:
echo "\d addresses" | psql $PGDATABASE
```

### Regular Maintenance
- **Daily**: Check logs, database optimization
- **Weekly**: Full database maintenance, backup
- **Monthly**: Large database optimization, update dependencies

---

## 📞 Support

- **Configuration Issues**: Check this guide and `.env.example`
- **Performance Issues**: Run `./run.sh db-analyze`
- **API Issues**: Verify keys and rate limits
- **Database Issues**: Check PostgreSQL logs

For additional help, check component-specific README files in each directory.