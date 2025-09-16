#!/usr/bin/env bash
# Cron-compatible script for fund updates
# Usage in crontab: 0 */6 * * * /path/to/onchainScanner/scanners/cron/cron-funds.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# Environment setup
export TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-7200}"  # Standard timeout for fund updates
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Log file with timestamp
LOG_FILE="$SCRIPT_DIR/logs/cron-funds-$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$SCRIPT_DIR/logs"

# Execute with proper output redirection
exec >> "$LOG_FILE" 2>&1

echo "====== CRON FUNDS UPDATE STARTED: $(date) ======"

# Run fund updates (sequential for stability)
./run.sh funds

echo "====== CRON FUNDS UPDATE FINISHED: $(date) ======"