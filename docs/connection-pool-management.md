# HTTP Connection Pool Management Guide

## Issue: Socket Hang Up Error

```
[network] Alchemy RPC error for eth_call: socket hang up
```

**Cause:**
- Creating new TCP connection for every request → Connection pool exhaustion
- Chunk 1 (90,000 queries) completes and connections close
- Chunk 2 starts and needs new connections → Fails

---

## Solution: Connection Reuse with HTTP Agent

### Node.js Client Implementation

```javascript
const axios = require('axios');
const http = require('http');
const https = require('https');

class APIClient {
  constructor(baseURL) {
    this.baseURL = baseURL;

    // Create HTTP/HTTPS Agent
    this.httpAgent = new http.Agent({
      keepAlive: true,              // Reuse connections
      keepAliveMsecs: 30000,        // Keep alive for 30 seconds
      maxSockets: 50,               // Maximum concurrent sockets
      maxFreeSockets: 10,           // Keep idle sockets
      timeout: 120000,              // 120 second timeout
      scheduling: 'lifo'            // Prioritize recent connections
    });

    this.httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 120000,
      scheduling: 'lifo'
    });
  }

  async request(endpoint, data) {
    return axios.post(`${this.baseURL}${endpoint}`, data, {
      timeout: 120000,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent
    });
  }
}
```

---

## Proxy Server Implementation

### 1. Modify Alchemy Proxy

File: `/root/BugChainProxy/alchemy-proxy-server/src/index.js`

```javascript
const http = require('http');
const https = require('https');

// Create global Agents (add at top of file)
const agents = {
  http: new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 100,              // Proxy needs more connections
    maxFreeSockets: 20,
    timeout: 120000,
    scheduling: 'lifo'
  }),
  https: new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 100,
    maxFreeSockets: 20,
    timeout: 120000,
    scheduling: 'lifo'
  })
};

// Add to all axios calls
async function callAlchemy(url, data) {
  return axios.post(url, data, {
    timeout: 120000,
    httpAgent: agents.http,
    httpsAgent: agents.https
  });
}

// Cleanup on exit
process.on('SIGTERM', () => {
  agents.http.destroy();
  agents.https.destroy();
  process.exit(0);
});
```

### 2. Deployment

```bash
# Restart proxy
pm2 restart alchemy-proxy

# Check logs
pm2 logs alchemy-proxy --lines 50
```

---

## Configuration Guidelines

| Setting | Client | Proxy | Description |
|------|----------|--------|------|
| `maxSockets` | 50 | 100 | Concurrent connections |
| `maxFreeSockets` | 10 | 20 | Keep idle connections |
| `keepAliveMsecs` | 30000 | 30000 | Connection lifetime (ms) |
| `scheduling` | lifo | lifo | Prioritize recent connections (recommended) |

**Proxy needs 2x more connections than client**

---

## Verification

### Check for Socket Hang Up
```bash
# Count error occurrences
grep -c "socket hang up" /root/BugChainIndexer/scanners/logs/*.log

# Check connection status
netstat -an | grep :3002 | grep ESTABLISHED | wc -l
```

### Performance Measurement
```bash
# Average time for 100 requests
for i in {1..100}; do
  time curl -X POST http://localhost:3002/rpc/ethereum \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}'
done 2>&1 | grep real
```

---

## Troubleshooting

### "Too many open files"
```bash
# Increase file descriptor limit
ulimit -n 65536

# Make permanent
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf
```

### Connections Not Being Reused
```javascript
// Explicitly set headers
axios.post(url, data, {
  httpAgent: agent,
  headers: { 'Connection': 'keep-alive' }
});
```

---

## Checklist

### Implementation
- [ ] Create http/https Agents
- [ ] Add agents to all axios calls
- [ ] Add cleanup logic on exit

### Verification
- [ ] Confirm Socket hang up error reduction
- [ ] Confirm response time improvement (100-200ms reduction)
- [ ] Confirm connection reuse statistics

---

## Expected Results

- ✅ 90% reduction in Socket Hang Up errors
- ✅ 100-200ms reduction in response time
- ✅ 2-3x improvement in throughput

---

## Last Update

**Date**: 2025-11-01
**Version**: 2.0
**Changes**:
- Added project structure document link
- Specified related file paths

---

## Related Documents
- [Project Structure](./project-structure.md)
- [API Performance Optimization](./api-performance-optimization.md)

## Related Files
- **Alchemy RPC**: `scanners/common/alchemyRpc.js`
- **Scanner Base**: `scanners/common/Scanner.js`
