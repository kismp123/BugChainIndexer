# Redis Caching Strategy Documentation

## Overview
This document explains the caching strategy and implementation details using Redis in the BugChain Indexer.

**Redis Version**: 7.x
**Host**: localhost:6379
**Purpose**: API response caching, COUNT query result caching

---

## Redis Configuration

### Memory Settings
```bash
# Redis memory limit (3GB)
redis-cli CONFIG SET maxmemory 3gb

# LRU policy (delete oldest keys when memory exceeds limit)
redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Save configuration
redis-cli CONFIG REWRITE
```

### Memory Usage
```bash
# Check current memory usage
redis-cli INFO memory | grep used_memory_human

# Detailed memory information
redis-cli MEMORY STATS
```

### Persistence Settings (Optional)
For cache data, it's recommended to disable persistence as it's temporary data.

```bash
# Disable RDB snapshots
redis-cli CONFIG SET save ""

# Disable AOF
redis-cli CONFIG SET appendonly no
```

---

## Caching Architecture

### 1. Network Count Caching (Memory)

#### Purpose
Cache the number of addresses per network in memory to maximize performance for network filter-only queries.

#### Cache Key and TTL
```javascript
const NETWORK_COUNTS_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours (14,400 seconds)
let networkCountsCache = null;                        // { ethereum: 12345, binance: 23456, ... }
let networkCountsCacheTime = 0;                       // Last update timestamp
```

#### Implementation
```javascript
async function getNetworkCounts() {
  const now = Date.now();

  // Check cache validity
  if (networkCountsCache && (now - networkCountsCacheTime) < NETWORK_COUNTS_CACHE_TTL) {
    console.log('[Network Counts] Using cached counts');
    return networkCountsCache;
  }

  // DB query
  console.log('[Network Counts] Refreshing from database...');
  const query = `
    SELECT network, COUNT(*)::int AS count
    FROM addresses
    WHERE (tags IS NULL OR NOT 'EOA' = ANY(tags))
    GROUP BY network
  `;

  const { rows } = await pool.query(query);

  // Convert to object and cache
  networkCountsCache = rows.reduce((acc, row) => {
    acc[row.network] = row.count;
    return acc;
  }, {});
  networkCountsCacheTime = now;

  return networkCountsCache;
}
```

#### Usage Example
```javascript
// When API has only network filter
if (networks && networks.length > 0 && !otherFilters) {
  const networkCounts = await getNetworkCounts();
  const total = networks.reduce((sum, net) => sum + (networkCounts[net] || 0), 0);
  // 23s → 0.09s (255x improvement)
}
```

#### Characteristics
- **Storage**: Memory (variable)
- **TTL**: 4 hours
- **Size**: < 1KB
- **Performance**: 0.09s (vs 23s DB GROUP BY)
- **Synchronization**: Auto-initialized on server restart

---

### 2. COUNT Query Caching (Redis)

#### Purpose
Cache COUNT query results when the `getAddressesByFilter` API uses `includeTotal=true` parameter to improve performance.

#### Cache Key Generation
```javascript
function getCountCacheKey(filters, hideUnnamed) {
  const { deployedFrom, deployedTo, fundFrom, fundTo, networks, tags, address, contractName } = filters;

  // Convert filter conditions to normalized object
  const cacheKeyObj = {
    hideUnnamed,
    deployedFrom: deployedFrom ?? null,
    deployedTo: deployedTo ?? null,
    fundFrom: fundFrom ?? null,
    fundTo: fundTo ?? null,
    networks: networks ? [...networks].sort() : null,  // Normalize order
    tags: tags ? [...tags].sort() : null,              // Normalize order
    address: address ?? null,
    contractName: contractName ?? null,
  };

  // JSON serialization followed by SHA256 hashing
  const keyStr = JSON.stringify(cacheKeyObj);
  const hash = crypto.createHash('sha256').update(keyStr).digest('hex').substring(0, 16);

  return `addresses:count:${hash}`;
}
```

#### Cache Key Examples
```
addresses:count:6790d87f1fdaa4f4  // networks=ethereum,binance,... hideUnnamed=true
addresses:count:a3f8d92c1e4b5678  // networks=ethereum hideUnnamed=false
addresses:count:9c2e4f1a3d5b6789  // No filter, hideUnnamed=true
```

#### TTL (Time To Live)
```javascript
// 5 minute (300 seconds) TTL
await redisClient.setEx(cacheKey, 300, result.rows[0].total.toString());
```

#### Cache Flow
```
Receive request
  ↓
includeTotal === true?
  ├─ No → Skip COUNT query
  └─ Yes
       ↓
     Generate cache key
       ↓
     Redis GET
       ├─ Cache HIT → Return immediately (~10ms)
       └─ Cache MISS
            ↓
          Execute DB COUNT query
            ↓
          Redis SET (TTL: 5 min)
            ↓
          Return result
```

#### Implementation Code
```javascript
// Check Redis cache
if (redisConnected && redisClient) {
  try {
    const cachedCount = await redisClient.get(cacheKey);
    if (cachedCount !== null) {
      console.log(`[Cache HIT] Count cached for key: ${cacheKey}`);
      return { rows: [{ total: BigInt(cachedCount) }] };
    }
    console.log(`[Cache MISS] Fetching count from DB for key: ${cacheKey}`);
  } catch (err) {
    console.error('Redis get error:', err);
  }
}

// Execute DB query
const result = await pool.query(countSql, paramsNoCursor);

// Cache in Redis
if (redisConnected && redisClient && result.rows[0]?.total != null) {
  try {
    await redisClient.setEx(cacheKey, 300, result.rows[0].total.toString());
    console.log(`[Cache SET] Cached count for key: ${cacheKey}, value: ${result.rows[0].total}`);
  } catch (err) {
    console.error('Redis set error:', err);
  }
}
```

---

## Cache Invalidation Strategy

### Automatic Invalidation (TTL)
By default, caches automatically expire after 5 minutes TTL.

```bash
# Check TTL for specific key
redis-cli TTL "addresses:count:6790d87f1fdaa4f4"

# Example output: 278 (in seconds)
```

### Manual Invalidation
Related caches can be manually deleted when data is updated.

```bash
# Delete all COUNT caches
redis-cli KEYS "addresses:count:*" | xargs redis-cli DEL

# Delete specific cache only
redis-cli DEL "addresses:count:6790d87f1fdaa4f4"

# Pattern-based deletion (caution: KEYS is a blocking operation)
redis-cli --scan --pattern "addresses:count:*" | xargs redis-cli DEL
```

### Cache Warming (Optional)
For frequently used queries, caches can be pre-populated.

```javascript
// Pre-cache popular filter combinations
const popularFilters = [
  { networks: ['ethereum', 'binance'], hideUnnamed: true },
  { networks: ['ethereum'], hideUnnamed: true },
  { networks: ['binance'], hideUnnamed: false },
];

for (const filter of popularFilters) {
  await getAddressesByFilter({ ...filter, includeTotal: true });
}
```

---

## Performance Metrics

### Cache Hit Rate Monitoring
```bash
# Check Redis statistics
redis-cli INFO stats | grep -E "keyspace_hits|keyspace_misses"

# Calculate hit rate
# Hit Rate = keyspace_hits / (keyspace_hits + keyspace_misses) * 100
```

#### Example Output
```
keyspace_hits:277498
keyspace_misses:41576

Hit Rate = 277498 / (277498 + 41576) * 100 = 87%
```

### Response Time Comparison
| Situation | Response Time | Improvement Ratio |
|-----|---------|---------|
| Cache MISS (DB query) | ~500-1000ms | Baseline |
| Cache HIT (Redis) | ~10-20ms | 50-100x |

### Memory Usage
```bash
# Check number of cache keys
redis-cli DBSIZE

# Number of keys matching specific pattern
redis-cli KEYS "addresses:count:*" | wc -l

# Memory usage per key
redis-cli --scan --pattern "addresses:count:*" | \
  while read key; do
    echo "$key: $(redis-cli MEMORY USAGE $key) bytes"
  done
```

---

## Redis Connection Management

### Connection Initialization
```javascript
const redis = require('redis');

let redisClient = null;
let redisConnected = false;

(async () => {
  try {
    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379')
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    redisClient.on('error', (err) => {
      console.error('Redis client error:', err);
      redisConnected = false;
    });

    redisClient.on('connect', () => {
      console.log('Redis connected for count caching');
      redisConnected = true;
    });

    redisClient.on('reconnecting', () => {
      console.log('Redis reconnecting...');
    });

    await redisClient.connect();
  } catch (error) {
    console.warn('Redis not available for count caching, using DB only:', error.message);
    redisConnected = false;
  }
})();
```

### Error Handling
The API should work normally even when Redis connection fails (Graceful Degradation).

```javascript
// Fallback to DB query when Redis is unavailable
if (redisConnected && redisClient) {
  try {
    const cachedCount = await redisClient.get(cacheKey);
    // ...
  } catch (err) {
    console.error('Redis get error:', err);
    // fallback to DB query
  }
}

// DB query executes even without Redis
const result = await pool.query(countSql, paramsNoCursor);
```

### Connection Pool Management
The Redis client automatically manages connection pooling.

```javascript
// Set maximum retry attempts
redisClient = redis.createClient({
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        return new Error('Max retry attempts reached');
      }
      return Math.min(retries * 100, 3000); // Maximum 3 second wait
    }
  }
});
```

---

## Monitoring and Debugging

### Real-time Monitoring
```bash
# Monitor Redis commands in real-time
redis-cli MONITOR

# Example output:
# 1730434800.123456 [0 127.0.0.1:52345] "GET" "addresses:count:6790d87f1fdaa4f4"
# 1730434800.234567 [0 127.0.0.1:52345] "SETEX" "addresses:count:6790d87f1fdaa4f4" "300" "6535"
```

### Slow Log Check
```bash
# Set slow log threshold (100ms or more)
redis-cli CONFIG SET slowlog-log-slower-than 100000

# Check slow log
redis-cli SLOWLOG GET 10
```

### Backend Log Check
```bash
# Filter cache hit/miss logs
pm2 logs backend | grep -E "\[Cache (HIT|MISS|SET)\]"

# Example output:
# [Cache MISS] Fetching count from DB for key: addresses:count:6790d87f1fdaa4f4
# [Cache SET] Cached count for key: addresses:count:6790d87f1fdaa4f4, value: 6535
# [Cache HIT] Count cached for key: addresses:count:6790d87f1fdaa4f4
```

---

## Troubleshooting

### Issue 1: Redis Connection Failure
**Symptom**: "Redis not available for count caching" message in backend logs

**Causes**:
- Redis service is not running
- Network connection issues
- Incorrect host/port settings

**Solution**:
```bash
# Check Redis service status
systemctl status redis

# Start Redis
systemctl start redis

# Test connection
redis-cli ping
# Output: PONG

# Restart backend
pm2 restart backend
```

### Issue 2: Out of Memory
**Symptom**: OOM (Out of Memory) error from Redis

**Cause**: Exceeding configured maxmemory

**Solution**:
```bash
# Check current memory usage
redis-cli INFO memory

# Increase maxmemory
redis-cli CONFIG SET maxmemory 5gb

# Or verify LRU policy
redis-cli CONFIG GET maxmemory-policy
# Should be set to allkeys-lru for automatic deletion of old keys

# Manually clear cache
redis-cli FLUSHDB
```

### Issue 3: Low Cache Hit Rate
**Symptom**: Hit rate below 50%

**Causes**:
- TTL is too short
- Request patterns are very diverse
- Cache key generation logic issues

**Solution**:
```bash
# Check TTL
redis-cli TTL "addresses:count:*"

# Increase TTL (requires code modification)
# In address.service.js, change setEx TTL from 300 → 600

# Analyze popular query patterns
redis-cli --scan --pattern "addresses:count:*" | \
  while read key; do
    echo "$key: $(redis-cli GET $key)"
  done
```

### Issue 4: Stale Cache Data
**Symptom**: Returns old data even after DB updates

**Cause**: Cache hasn't expired yet

**Solution**:
```bash
# Invalidate cache immediately
redis-cli KEYS "addresses:count:*" | xargs redis-cli DEL

# Or delete specific pattern only
redis-cli --scan --pattern "addresses:count:*hideUnnamed*" | xargs redis-cli DEL
```

---

## Security

### Authentication Setup
```bash
# Set Redis password
redis-cli CONFIG SET requirepass "your_secure_password"

# Pass password via environment variable
export REDIS_PASSWORD="your_secure_password"

# Restart backend
pm2 restart backend
```

### Network Restrictions
```bash
# Edit redis.conf
# bind 127.0.0.1 ::1  # Allow localhost only

# Or configure UFW firewall
ufw allow from 127.0.0.1 to any port 6379
```

---

## Future Improvements

### 1. Expand Data Caching
Currently only COUNT queries are cached, but full data results could also be cached in the future.

```javascript
// Data caching example (not implemented)
const dataKey = `addresses:data:${hash}`;
const cachedData = await redisClient.get(dataKey);
if (cachedData) {
  return JSON.parse(cachedData);
}
// ... DB query ...
await redisClient.setEx(dataKey, 300, JSON.stringify(result));
```

### 2. Automate Cache Warming
Use Cron to periodically execute popular queries to pre-populate cache.

```bash
# Crontab example
*/10 * * * * curl -s "https://api.bugchain.xyz/getAddressesByFilter?networks=ethereum&hideUnnamed=true&includeTotal=true" > /dev/null
```

### 3. Redis Cluster
Scale to Redis Cluster when traffic increases.

```javascript
const redisClient = redis.createCluster({
  rootNodes: [
    { host: '127.0.0.1', port: 6379 },
    { host: '127.0.0.1', port: 6380 },
  ]
});
```

---

## Caching Strategy Comparison

| Cache Type | Storage | TTL | Purpose | Performance | Size |
|----------|--------|-----|------|------|------|
| Network Counts | Memory (variable) | 4 hours | Address count per network | 0.09s | < 1KB |
| COUNT Query | Redis | 5 min | COUNT for complex filter combinations | 0.01-0.02s | Tens of bytes/key |
| Materialized View | PostgreSQL | Manual | DISTINCT ON results | 0.1s | ~2MB |

---

## Last Update

**Date**: 2025-11-01
**Version**: 2.0
**Changes**:
- Added network count memory caching strategy
- Added caching strategy comparison table
- Synchronized with actual implementation

---

## Related Documents
- [Project Structure](./project-structure.md)
- [API Performance Optimization](./api-performance-optimization.md)
- [Database Schema](./database-schema.md)
- [Materialized Views Details](./materialized-views.md)

## External Links
- [Redis Official Documentation](https://redis.io/documentation)
- [Redis Best Practices](https://redis.io/docs/manual/patterns/)
- [Node Redis Client](https://github.com/redis/node-redis)
