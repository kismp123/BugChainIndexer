# API Performance Optimization Documentation

## Overview
This document explains the process and structure of optimizing the BugChain Indexer API performance, reducing response time from 125 seconds to under 1 second.

**Optimization Date**: 2025-11-01
**Target API**: `/getAddressesByFilter`

---

## Performance Improvement Results

### Before (Pre-optimization)
- **Response Time**: 125+ seconds
- **Issue**: Cloudflare 524 Gateway Timeout occurring
- **Cause**: Real-time calculation of 6,535 unique contracts using DISTINCT ON from 270,661 rows

### After (Post-optimization)
- **First Request**: 1.03 seconds (121x improvement)
- **Cache Hit**: 0.40 seconds (310x improvement)
- **Status**: Working normally, timeout completely resolved

---

## Optimization Strategies

### 1. Network Count Caching
Cache the number of addresses per network in memory to optimize COUNT queries.

#### Implementation
```javascript
const NETWORK_COUNTS_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
let networkCountsCache = null;
let networkCountsCacheTime = 0;

async function getNetworkCounts() {
  const now = Date.now();
  if (networkCountsCache && (now - networkCountsCacheTime) < NETWORK_COUNTS_CACHE_TTL) {
    return networkCountsCache;
  }

  // Query network counts from DB
  const query = `
    SELECT network, COUNT(*)::int AS count
    FROM addresses
    WHERE (tags IS NULL OR NOT 'EOA' = ANY(tags))
    GROUP BY network
  `;

  const { rows } = await pool.query(query);
  networkCountsCache = rows.reduce((acc, row) => {
    acc[row.network] = row.count;
    return acc;
  }, {});
  networkCountsCacheTime = now;

  return networkCountsCache;
}
```

#### Benefits
- Network filter-only queries: 23s → 0.09s (255x improvement)
- 4-hour TTL minimizes DB load
- Minimal memory usage (< 1KB)

### 2. Materialized View Introduction
Use PostgreSQL Materialized View to pre-calculate complex DISTINCT ON queries.

#### Implementation
```sql
CREATE MATERIALIZED VIEW mv_distinct_contracts AS
SELECT DISTINCT ON (contract_name)
  address, contract_name, deployed, fund, network, first_seen
FROM addresses
WHERE (tags IS NULL OR NOT 'EOA' = ANY(tags))
  AND contract_name IS NOT NULL
  AND contract_name != ''
ORDER BY contract_name, first_seen DESC NULLS LAST, fund DESC NULLS LAST, address ASC;
```

#### Indexes
```sql
-- For first_seen sorting
CREATE INDEX idx_mv_distinct_first_seen
  ON mv_distinct_contracts (first_seen DESC NULLS LAST);

-- For fund sorting
CREATE INDEX idx_mv_distinct_fund
  ON mv_distinct_contracts (fund DESC NULLS LAST, deployed DESC NULLS LAST);

-- For network + first_seen filtering
CREATE INDEX idx_mv_distinct_network_first_seen
  ON mv_distinct_contracts (network, first_seen DESC NULLS LAST);

-- For network + fund filtering
CREATE INDEX idx_mv_distinct_network_fund
  ON mv_distinct_contracts (network, fund DESC NULLS LAST, deployed DESC NULLS LAST);
```

#### Benefits
- Query execution time: ~188s → ~0.1s (1880x improvement)
- Indexes work efficiently for network filtering with fast responses
- Stores only 6,535 rows, memory efficient

### 3. Redis Caching
Cache COUNT query results in Redis to improve performance on repeat requests.

#### Cache Key Generation
```javascript
function getCountCacheKey(filters, hideUnnamed) {
  const { deployedFrom, deployedTo, fundFrom, fundTo, networks, tags, address, contractName } = filters;

  const cacheKeyObj = {
    hideUnnamed,
    deployedFrom: deployedFrom ?? null,
    deployedTo: deployedTo ?? null,
    fundFrom: fundFrom ?? null,
    fundTo: fundTo ?? null,
    networks: networks ? [...networks].sort() : null,
    tags: tags ? [...tags].sort() : null,
    address: address ?? null,
    contractName: contractName ?? null,
  };

  const keyStr = JSON.stringify(cacheKeyObj);
  const hash = crypto.createHash('sha256').update(keyStr).digest('hex').substring(0, 16);

  return `addresses:count:${hash}`;
}
```

#### Cache Strategy
- **TTL**: 5 minutes (300 seconds)
- **Cache Key**: Generate unique key by SHA256 hashing filter conditions
- **Stored Data**: COUNT query result (BigInt)
- **Cache Policy**: LRU (Least Recently Used)

#### Cache Flow
```
1. Receive request
   ↓
2. Generate cache key
   ↓
3. Redis lookup (Cache Hit?)
   ├─ Yes → Return cached value (~10ms)
   └─ No → Execute DB query (~100-500ms)
           ↓
           Store result in Redis (TTL: 5 min)
           ↓
           Return result
```

### 4. Smart COUNT Strategy
Choose optimal COUNT strategy when includeTotal is requested.

#### Fast Path: Network Count Summation
```javascript
const hasOnlyNetworkFilter = rest.networks?.length > 0
  && !rest.address && !rest.contractName
  && !rest.deployedFrom && !rest.deployedTo
  && !rest.fundFrom && !rest.fundTo
  && !hideUnnamed;

if (hasOnlyNetworkFilter) {
  // Sum cached network counts (0.09s)
  const networkCounts = await getNetworkCounts();
  const total = rest.networks.reduce((sum, net) =>
    sum + (networkCounts[net] || 0), 0);
  return { rows: [{ total: BigInt(total) }] };
}
```

#### Redis Cache: Complex Filters
```javascript
// Check Redis cache
const cacheKey = getCountCacheKey(rest, hideUnnamed);
const cachedCount = await redisClient.get(cacheKey);
if (cachedCount !== null) {
  return { rows: [{ total: BigInt(cachedCount) }] };
}
```

#### DB Query: Cache Miss
```javascript
// COUNT from Materialized View or addresses table
const result = await pool.query(countSql, paramsNoCursor);
await redisClient.setEx(cacheKey, 300, result.rows[0].total.toString());
```

### 5. Query Optimization

#### hideUnnamed=true (default)
Use Materialized View to query pre-calculated results.

```javascript
if (hideUnnamed) {
  // Use Materialized View
  dataSql = `
    SELECT address, contract_name, deployed, fund, network, first_seen
    FROM mv_distinct_contracts
    WHERE 1=1
      ${whereSql ? 'AND ' + whereSql.replace('WHERE ', '') : ''}
    ${orderByClause}
    LIMIT ${take + 1}
  `;

  // COUNT also from Materialized View
  countSql = `
    SELECT COUNT(*)::bigint AS total
    FROM mv_distinct_contracts
    WHERE 1=1
      ${whereSqlNoCursor ? 'AND ' + whereSqlNoCursor.replace('WHERE ', '') : ''}
  `;
}
```

#### hideUnnamed=false
Query directly from the addresses table.

```javascript
else {
  dataSql = `
    SELECT address, contract_name, deployed, fund, network, first_seen
    FROM addresses
    WHERE (tags IS NULL OR NOT 'EOA' = ANY(tags))
      ${whereSql ? 'AND ' + whereSql.replace('WHERE ', '') : ''}
    ${orderByClause}
    LIMIT ${take + 1}
  `;
}
```

---

## API Endpoint Specification

### GET /getAddressesByFilter

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---------|------|------|--------|------|
| `networks` | string[] | No | - | Network filter (comma-separated) |
| `sortBy` | string | No | `fund` | Sort criteria (`fund`, `first_seen`) |
| `hideUnnamed` | boolean | No | `false` | Hide unnamed contracts |
| `limit` | number | No | `50` | Results per page (max 200) |
| `includeTotal` | boolean | No | `false` | Include total count |
| `cursor` | object | No | - | Pagination cursor |

#### Response
```json
{
  "limit": 50,
  "hasNext": true,
  "nextCursor": {
    "first_seen": "1761951605",
    "address": "0x0055448eeefd5c4bac80d260fa63ff0d8402685f"
  },
  "totalCount": 6535,
  "totalPages": 131,
  "data": [
    {
      "address": "0x...",
      "contract_name": "SafeProxy",
      "deployed": "1761658860",
      "fund": "0",
      "network": "gnosis",
      "first_seen": "1761958807"
    }
  ]
}
```

---

## Performance Monitoring

### Log Verification
```bash
# Check backend logs
pm2 logs backend --lines 100

# Check cache hit/miss
pm2 logs backend | grep -E "\[Cache (HIT|MISS)\]"
```

### Redis Monitoring
```bash
# Check Redis connection
redis-cli ping

# Check cache keys
redis-cli keys "addresses:count:*"

# Check memory usage
redis-cli info memory
```

### PostgreSQL Performance Check
```sql
-- Check Materialized View size
SELECT pg_size_pretty(pg_total_relation_size('mv_distinct_contracts'));

-- Check query execution plan
EXPLAIN ANALYZE
SELECT * FROM mv_distinct_contracts
WHERE network = 'ethereum'
ORDER BY first_seen DESC
LIMIT 50;
```

---

## Maintenance

### Materialized View Refresh
Materialized Views don't refresh automatically and need periodic updates.

```sql
-- Full refresh (when data changes)
REFRESH MATERIALIZED VIEW mv_distinct_contracts;

-- Concurrent refresh (no service interruption)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_distinct_contracts;
```

#### Automatic Refresh Schedule (Recommended)
```bash
# Cron setup (daily at 3 AM)
0 3 * * * sudo -u postgres psql -d bugchain_indexer -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_distinct_contracts;"
```

### Redis Cache Invalidation
Invalidate cache when filter conditions change or data is updated.

```bash
# Delete all caches
redis-cli KEYS "addresses:count:*" | xargs redis-cli DEL

# Delete specific cache
redis-cli DEL "addresses:count:6790d87f1fdaa4f4"
```

---

## Troubleshooting

### Issue: Materialized View Not Reflecting Latest Data
**Solution**: Refresh the Materialized View.
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_distinct_contracts;
```

### Issue: Redis Connection Failure
**Symptom**: "Redis not available for count caching" message in logs
**Solution**:
1. Check Redis service: `systemctl status redis`
2. Restart Redis: `systemctl restart redis`
3. Restart Backend: `pm2 restart backend`

### Issue: COUNT Query Still Slow
**Cause**: Cache miss or complex filter conditions
**Solution**:
1. Check Redis cache
2. Check Materialized View indexes
3. Analyze query execution plan with EXPLAIN ANALYZE

---

## Reference

### Related Files
- **Service Code**: `server/backend/services/address.service.js`
- **Controller**: `server/backend/controllers/address.controller.js`
- **DB Connection**: `server/backend/services/db.js`

### Related Documents
- [Project Structure](./project-structure.md)
- [Database Schema](./database-schema.md)
- [Caching Strategy](./caching-strategy.md)
- [Materialized Views Details](./materialized-views.md)

### External Links
- [PostgreSQL Materialized Views](https://www.postgresql.org/docs/current/rules-materializedviews.html)
- [Redis Caching Best Practices](https://redis.io/docs/manual/client-side-caching/)

---

## Last Update

**Date**: 2025-11-01
**Version**: 2.0
**Changes**:
- Added network count caching strategy (4-hour TTL)
- Added smart COUNT strategy (Fast Path)
- Synchronized with actual code implementation
- Specified multi-tier optimization strategy
