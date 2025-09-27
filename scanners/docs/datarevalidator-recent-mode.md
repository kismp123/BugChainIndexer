# DataRevalidator Recent Contracts Mode

## Overview
The DataRevalidator now supports a "Recent Contracts Mode" that allows you to specifically validate contracts discovered within a specified time period. This is useful for ensuring newly discovered contracts are properly classified and have accurate metadata.

## Configuration

### Environment Variables

- `RECENT_CONTRACTS=true` - Enable recent contracts mode
- `RECENT_DAYS=30` - Number of days to look back (default: 30)

## Usage

### Command Line

```bash
# Validate contracts discovered in last 30 days
NETWORK=ethereum RECENT_CONTRACTS=true RECENT_DAYS=30 node core/DataRevalidator.js

# Validate contracts discovered in last 7 days
NETWORK=ethereum RECENT_CONTRACTS=true RECENT_DAYS=7 node core/DataRevalidator.js

# Validate contracts discovered in last 24 hours
NETWORK=ethereum RECENT_CONTRACTS=true RECENT_DAYS=1 node core/DataRevalidator.js
```

### Using the Shell Script

```bash
# Usage: ./run-revalidator-recent.sh [network] [days]

# Validate Ethereum contracts from last 30 days
./run-revalidator-recent.sh ethereum 30

# Validate BSC contracts from last 7 days  
./run-revalidator-recent.sh binance 7

# Validate Polygon contracts from last 1 day
./run-revalidator-recent.sh polygon 1
```

## Modes Comparison

### Standard Mode (Default)
- Targets addresses without proper Contract/EOA tags
- Prioritizes by fund value and oldest updates first
- Processes all untagged addresses

### Recent Contracts Mode
- Targets only contracts discovered within specified days
- Uses `first_seen` timestamp to filter
- Prioritizes by discovery time (newest first) and fund value
- Ideal for:
  - Post-deployment validation of new contracts
  - Ensuring new contracts have proper metadata
  - Regular maintenance of recently added data

## Query Details

### Standard Mode Query
```sql
SELECT * FROM addresses
WHERE network = $1
AND (tags IS NULL OR tags = '{}' OR NOT 'EOA' = ANY(tags))
AND (tags IS NULL OR tags = '{}' OR NOT 'Contract' = ANY(tags))
ORDER BY fund DESC NULLS LAST, last_updated ASC NULLS FIRST
```

### Recent Mode Query
```sql
SELECT * FROM addresses  
WHERE network = $1
AND first_seen >= $2  -- Cutoff timestamp
AND (tags IS NULL OR tags = '{}' OR NOT 'EOA' = ANY(tags))
ORDER BY first_seen DESC, fund DESC NULLS LAST
```

## Example Output

```
🚀 Starting Data Revalidation Process
📅 RECENT MODE: Validating contracts discovered in last 7 days
🔍 Recent mode: Finding contracts discovered in last 7 days (since 2025-01-20T12:00:00.000Z)
📊 Found 156 addresses requiring revalidation

Processing batch 1/8 (20 items)...
📋 Address 0x123... is a CONTRACT
🔍 Fetching metadata for contract 0x123...
✅ Applied 20 corrections to database
```

## Testing

Run the test script to see how different modes work:

```bash
node tests/test-revalidator-recent.js
```

This will test:
- Standard mode
- Recent 30 days mode
- Recent 7 days mode  
- Recent 1 day mode

## Benefits

1. **Performance**: Process only relevant recent contracts instead of entire database
2. **Maintenance**: Keep newly discovered contracts properly validated
3. **Monitoring**: Easy to run daily/weekly for recent discoveries
4. **Flexibility**: Adjustable time window for different use cases