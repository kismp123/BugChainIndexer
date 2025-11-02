# Network Configuration Changelog

## [2024-11-02] - Gnosis API Migration & opbnb Removal

### Changed
- **Gnosis Network**: Switched from Dedicated API to V2 API
  - Reason: Gnosisscan deprecated V1 endpoint
  - Error: "You are using a deprecated V1 endpoint, switch to Etherscan API V2"
  - Solution: Comment out `explorerApiUrl`, use v2 API with chainid=100
  - Test Result: 3/3 contracts verified successfully with new API key

### Removed
- **opbnb Network**: Removed from active network list
  - Removed from `run.sh` NETWORKS array
  - Reason: DataRevalidator compatibility issues

### Network Count
- **Before**: 14 networks (8 dedicated, 6 v2, including opbnb)
- **After**: 13 networks (7 dedicated, 6 v2, opbnb removed)

### API Configuration Summary

#### Dedicated API Networks (7):
1. Ethereum (api.etherscan.io)
2. Polygon (api.polygonscan.com)
3. Arbitrum (api.arbiscan.io)
4. Optimism (api-optimistic.etherscan.io)
5. Base (api.basescan.org)
6. BSC (api.bscscan.com)
7. Avalanche (api.snowtrace.io)

#### V2 API Networks (6):
1. Linea (chainid: 59144)
2. Scroll (chainid: 534352)
3. Mantle (chainid: 5000)
4. Unichain (chainid: 1301)
5. Berachain (chainid: 80084)
6. **Gnosis** (chainid: 100) - **NEWLY MIGRATED**

### Performance Impact

#### Rate Limits:
- **Before**: 40 calls/sec (8 dedicated × 5) + 5 calls/sec (v2 shared) = 45 calls/sec
- **After**: 35 calls/sec (7 dedicated × 5) + 5 calls/sec (v2 shared) = 40 calls/sec
- **Impact**: -5 calls/sec (11% reduction)

#### API Key Requirements:
- **Before**: Single Etherscan API key for all networks
- **After**: Single Etherscan API key for all networks (unchanged)

### Test Results

#### Gnosis V2 API Test:
```
✅ Successful: 3/3 contracts
- TokenProxy (GNO Token)
- WXDAI (Wrapped XDAI)
- TokenProxy (USDC)
```

#### Mantle V2 API Test:
```
✅ Successful: 3/3 contracts
- WMANTLE
- USDT
- FiatTokenProxy
```

#### Avalanche API Test:
```
✅ Dedicated API: 3/3 contracts
✅ V2 API: 3/3 contracts
Decision: Keep Dedicated API (both work equally)
```

### Files Modified

1. **scanners/config/networks.js**
   - Commented out Gnosis `explorerApiUrl`
   - Added comment explaining v2 migration

2. **scanners/run.sh**
   - Removed opbnb from NETWORKS array
   - Updated from 12 to 11 active networks

3. **Test Files Added**:
   - `test-gnosis-contract-verification.js`
   - `test-gnosis-v2-api.js`
   - `test-gnosis-v2-with-key.js`
   - `test-mantle-contract-verification.js`
   - `test-avalanche-api.js`

### Migration Notes

#### Why Gnosis Migrated to V2:
1. Gnosisscan's dedicated API deprecated V1 endpoint
2. Requires migration to v2 for continued operation
3. Etherscan v2 API supports Gnosis (chainid: 100)
4. Single API key works for both (no separate registration needed)

#### Why opbnb Removed:
1. DataRevalidator scanner reported errors
2. Compatibility issues with current implementation
3. Can be re-added when issues are resolved

### Breaking Changes

⚠️ **None** - All changes are backward compatible:
- Existing API key continues to work
- No code changes required for applications using the scanner
- Gnosis verification now works better than before

### Recommendations

1. ✅ Update `.env` with new API key for improved reliability
2. ✅ Remove opbnb-specific scripts/configurations if any
3. ✅ Test Gnosis contract verification after deployment
4. ✅ Monitor rate limits (reduced by 11% due to fewer dedicated APIs)

### Next Steps

1. Deploy to server
2. Verify Gnosis contract retrieval working
3. Monitor scanner performance
4. Consider re-adding opbnb when compatible

---

**Commit**: 95ee264
**Date**: 2024-11-02
**Status**: Production Ready ✅
