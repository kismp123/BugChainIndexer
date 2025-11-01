# BugChain Indexer Documentation

This directory contains detailed documentation about BugChain Indexer's architecture, performance optimization, database structure, and more.

## Document List

### 1. [Project Structure](./project-structure.md)
- **Topic**: Complete project structure and architecture
- **Contents**:
  - Overall directory structure
  - scanners/ detailed structure (common, core, config, tokens, utils, etc.)
  - server/ detailed structure (backend API, frontend)
  - contract/ smart contracts
  - Data flow and database structure
  - Tech stack and performance metrics
  - Supported networks and environment variables
  - Key commands and migration history

**Audience**: All developers, new contributors

### 2. [API Performance Optimization](./api-performance-optimization.md)
- **Topic**: API response time optimization (125s → 1s)
- **Contents**:
  - Before/after performance comparison
  - Materialized View implementation
  - Redis caching strategy
  - Query optimization techniques
  - Performance monitoring methods
  - Troubleshooting guide

**Audience**: Backend developers, DevOps engineers

### 3. [Database Schema](./database-schema.md)
- **Topic**: PostgreSQL database structure and management
- **Contents**:
  - addresses table schema
  - Index strategy and optimization
  - Materialized View structure
  - Query patterns and examples
  - Backup and restore guide
  - Performance monitoring queries
  - VACUUM and maintenance

**Audience**: Database administrators, backend developers

### 4. [Caching Strategy](./caching-strategy.md)
- **Topic**: Redis-based caching strategy
- **Contents**:
  - Redis configuration and memory management
  - COUNT query caching implementation
  - Cache key generation algorithm
  - Cache invalidation strategy
  - Performance metrics and monitoring
  - Troubleshooting guide
  - Security configuration

**Audience**: Backend developers, DevOps engineers

### 5. [Materialized Views Details](./materialized-views.md)
- **Topic**: PostgreSQL Materialized Views in-depth analysis
- **Contents**:
  - Materialized View vs Regular View
  - mv_distinct_contracts implementation details
  - Index strategy
  - Refresh methods (REFRESH)
  - Automatic refresh scheduling
  - Performance comparison and analysis
  - Troubleshooting

**Audience**: Database administrators, backend developers

### 6. [Connection Pool Management](./connection-pool-management.md)
- **Topic**: Database connection pool management
- **Contents**: PostgreSQL connection pool configuration and optimization

**Audience**: Backend developers, DevOps engineers

### 7. [getLogs Optimization](./GETLOGS_OPTIMIZATION.md)
- **Topic**: Alchemy getLogs API optimization system
- **Contents**:
  - Tier-based profiles (Free/Premium)
  - Density-based profiles (Ultra-high/High/Medium/Low)
  - Dynamic learning mechanism
  - Performance results and cost analysis
  - Testing and configuration guide
  - Troubleshooting

**Audience**: Scanner developers, DevOps engineers

---

## Quick Reference

### Performance Improvements Summary
- **API response time**: 25s → < 1s (96% improvement)
- **Network count**: 23s → 0.09s (255x improvement)
- **Cache hit**: 0.01-0.02s (1000x+ improvement)
- **getLogs optimization**: 55% cost reduction, 99% fewer API calls (low-density chains)
- **Tech stack**:
  - Network count memory caching (4h TTL)
  - PostgreSQL Materialized Views
  - Redis COUNT query caching (5min TTL)
  - Adaptive getLogs batching with machine learning

### Key Components

#### 1. Materialized View
```sql
-- mv_distinct_contracts
-- Pre-computed aggregation: 270,661 rows → 6,535 rows
CREATE MATERIALIZED VIEW mv_distinct_contracts AS
SELECT DISTINCT ON (contract_name) ...
FROM addresses
WHERE ...
```

#### 2. Redis Caching
```javascript
// COUNT query result caching (TTL: 5 minutes)
const cacheKey = `addresses:count:${hash}`;
await redisClient.setEx(cacheKey, 300, count);
```

#### 3. Optimized Query
```javascript
// Use MV when hideUnnamed=true
SELECT * FROM mv_distinct_contracts
WHERE network = ANY(...)
ORDER BY first_seen DESC
LIMIT 50;
```

#### 4. getLogs Optimization
```javascript
// Adaptive batching based on network density
const profile = getLogsOptimization('ultra-high-density', 'premium');
// Ethereum: 33 blocks/request, 241 logs/block
// Mantle: 10,000 blocks/request, 0.63 logs/block
```

---

## Documentation Usage Guide

### For First-Time Readers
1. **Project Structure** document for overall architecture
2. **API Performance Optimization** document for optimization strategies
3. **Database Schema** document for data structure
4. **Caching Strategy** and **Materialized Views** documents for detailed technical understanding
5. **getLogs Optimization** for scanner efficiency improvements

### For Problem Solving
1. Check **Troubleshooting** sections in each document
2. Use **Monitoring** sections to check current state
3. Execute **Related Commands** for immediate action

### For Maintenance Work
1. **Database Schema** - Backup/restore, VACUUM
2. **Materialized Views** - Refresh schedule, automation
3. **Caching Strategy** - Cache invalidation, memory management
4. **getLogs Optimization** - Monitor API usage, adjust profiles

---

## Related File Locations

### Backend Code
- **Service**: `server/backend/services/address.service.js`
- **Controller**: `server/backend/controllers/address.controller.js`
- **Router**: `server/backend/routes/public.js`
- **DB Connection**: `server/backend/services/db.js`

### Scanner Code
- **DB Schema**: `scanners/common/database.js`
- **Alchemy RPC**: `scanners/common/alchemyRpc.js`
- **Unified Scanner**: `scanners/core/UnifiedScanner.js`
- **Fund Updater**: `scanners/core/FundUpdater.js`
- **Scanner Base**: `scanners/common/Scanner.js`

### Database
- **Host**: localhost
- **Database**: bugchain_indexer
- **Main Table**: addresses (Composite PK: address, network)
- **Additional Tables**: tokens, token_metadata_cache, symbol_prices, network_log_density_stats
- **Materialized View**: mv_distinct_contracts

### Redis
- **Host**: localhost:6379
- **Memory Limit**: 3GB
- **Policy**: allkeys-lru
- **Cache Key Pattern**: `addresses:count:*`

### Smart Contracts
- **BalanceHelper**: `contract/src/BalanceHelper.sol`
- **Deploy Script**: `contract/scripts/direct-deploy.js`

---

## Monitoring Checklist

### Daily Check
- [ ] API response time check (< 2s)
- [ ] Redis memory usage check (< 3GB)
- [ ] Backend process status check
- [ ] Scanner getLogs error rate (< 0.1%)

### Weekly Check
- [ ] Materialized View refresh (reflect latest data)
- [ ] Redis cache hit rate check (> 70%)
- [ ] Database VACUUM execution
- [ ] Scanner API usage review

### Monthly Check
- [ ] Full database backup
- [ ] Index reorganization (REINDEX)
- [ ] Performance trend analysis
- [ ] Log cleanup
- [ ] Review learned optimization statistics

---

## Emergency Response Guide

### When API Response is Slow
1. Check Materialized View refresh status
2. Check Redis cache status
3. Review PostgreSQL slow query log
4. Check backend logs

### When Memory is Insufficient
1. Check Redis memory usage
2. Delete unnecessary cache
3. Adjust maxmemory settings

### When Data is Inconsistent
1. Immediately refresh Materialized View
2. Delete entire Redis cache
3. Execute database ANALYZE

### When getLogs Errors Occur
1. Check 10K limit errors in logs
2. Review learned batch sizes
3. Manually adjust maxBatchSize if needed
4. Check network log density statistics

---

## Update History

### 2025-11-01
- **getLogs Optimization** system implemented
  - Tier-based profiles (Free/Premium)
  - Density-based profiles (4 categories)
  - Dynamic learning mechanism
  - 55% cost reduction, 99% API call reduction (low-density)
  - Zero 10K limit errors
- **Testing suite** added
  - Profile validation tests
  - Integration tests
  - Learning persistence tests
- **Documentation** updated
  - New GETLOGS_OPTIMIZATION.md document
  - README converted to English
  - All technical details documented

### 2025-11-01 (Earlier)
- **Project Structure** document added (complete architecture)
- **API Performance Optimization** completed (25s → 1s)
- **Network Count Caching** implemented (4h TTL, in-memory)
- Materialized View `mv_distinct_contracts` implemented
- Redis COUNT query caching implemented (5min TTL)
- All documents updated to match actual implementation
- 6 detailed documents written/updated

### 2024-10-05
- Connection Pool management document created

---

## Contribution Guide

### When Updating Documents
1. Update **Update History** section in related documents
2. Update **Update History** section in this README
3. Synchronize example code when code changes

### When Adding New Documents
1. Add document to this README
2. Add cross-links between related documents
3. Update **Document List** section

---

## Contact and Support

### Issue Reporting
- Backend logs: `pm2 logs backend`
- PostgreSQL logs: `/var/log/postgresql/`
- Redis logs: `redis-cli MONITOR`
- Scanner logs: Check console output

### Additional Information
- PostgreSQL Official Docs: https://www.postgresql.org/docs/
- Redis Official Docs: https://redis.io/documentation
- Node.js Redis Client: https://github.com/redis/node-redis
- Alchemy API Docs: https://docs.alchemy.com/reference/api-overview

---

## License

This documentation is part of the BugChain Indexer project.

**Last Updated**: 2025-11-01
