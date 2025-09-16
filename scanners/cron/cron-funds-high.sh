#!/usr/bin/env bash
# Cron-compatible script for high-value fund updates
# Usage in crontab: 0 */4 * * * /path/to/onchainScanner/scanners/cron/cron-funds-high.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# Environment setup
export TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-7200}"  # Standard timeout for fund updates
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Log file with timestamp
LOG_FILE="$SCRIPT_DIR/logs/cron-funds-high-$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$SCRIPT_DIR/logs"

# Execute with proper output redirection
exec >> "$LOG_FILE" 2>&1

echo "====== CRON HIGH-VALUE FUNDS UPDATE STARTED: $(date) ======"

# Run high-value fund updates (parallel for efficiency)
./run.sh funds-high

echo "====== CRON HIGH-VALUE FUNDS UPDATE FINISHED: $(date) ======"