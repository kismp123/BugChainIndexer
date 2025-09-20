# Fix deployment time retrieval and improve API handling

## Major Changes

### 1. Fixed Etherscan Proxy Module Handling
- Added special handling for proxy module responses (no status field)
- Proxy module uses JSON-RPC format instead of standard response format
- Prevents false errors when calling eth_getBlockByNumber, eth_getTransactionByHash, etc.

### 2. Genesis Contract Support
- Added genesis contract detection (GENESIS_ prefixed tx hashes)
- Created centralized genesis timestamp configuration
- Added `isGenesis` flag to deployment time results
- Genesis contracts now use network-specific genesis timestamps

### 3. Deployment Time Updates
- Created script to update verified contracts' deployment times
- Handles EOA detection and tag updates
- Supports batch processing with API key rotation
- Distinguishes between "No data found" (not an error) and actual errors

### 4. Configuration Improvements
- Created `config/genesis-timestamps.js` for centralized genesis timestamp management
- Added all 19 networks with genesis timestamps
- Provides utility functions for easy network addition

## New Files

### Configuration
- `config/genesis-timestamps.js` - Centralized genesis timestamp management

### Scripts
- `scripts/update-verified-contracts-deployed.js` - Update deployment times for verified contracts
- `scripts/list-genesis-timestamps.js` - List all genesis timestamps with details

### Tests
- `tests/test-api-status-field.js` - Test API status field presence
- `tests/test-proxy-module-fix.js` - Test proxy module handling
- `tests/test-genesis-config.js` - Test genesis timestamp configuration
- `tests/test-deployment-time-failures.js` - Analyze deployment time failure cases
- `tests/test-real-notok-cases.js` - Test real NOTOK cases from database
- `tests/test-eoa-check.js` - Check if addresses are EOAs or contracts
- `tests/test-deployed-equals-firstseen.js` - Test addresses where deployed=first_seen
- `tests/test-top-funded-deployed.js` - Test deployment times for top funded addresses
- `tests/test-address-case.js` - Test address case sensitivity
- `tests/test-v2-api-update.js` - Test V2 API implementation
- `tests/test-v2-notok-reasons.js` - Analyze V2 API NOTOK reasons
- `tests/test-v2-api-notok.js` - Test V2 API NOTOK responses

## Modified Files

### core.js
- Added proxy module special handling
- Improved NOTOK response handling
- Use centralized genesis timestamps
- Better error differentiation

### UnifiedScanner.js
- Added genesis contract detection
- Pass `isGenesis` flag in contract data
- Prepared for genesis tag addition

## Database Updates (via script)
- Set deployed=0 for 325,045 addresses where deployed=first_seen
- Enables revalidation of deployment times
- Updates tags for EOAs incorrectly marked as contracts

## Key Improvements
1. ✅ No more false errors for proxy module calls
2. ✅ Genesis contracts properly identified and timestamped
3. ✅ "No data found" no longer treated as error
4. ✅ Centralized configuration for easy maintenance
5. ✅ Comprehensive test coverage for all scenarios

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>