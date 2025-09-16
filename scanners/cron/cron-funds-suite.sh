#!/usr/bin/env bash
# Cron-compatible script for complete funds update suite
# Usage in crontab: 0 */3 * * * /path/to/onchainScanner/scanners/cron/cron-funds-suite.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# Environment setup
export TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-7200}"  # Standard timeout for fund updates
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Log file with timestamp
LOG_FILE="$SCRIPT_DIR/logs/cron-funds-suite-$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$SCRIPT_DIR/logs"

# Execute with proper output redirection
exec >> "$LOG_FILE" 2>&1

echo "====== CRON FUNDS SUITE STARTED: $(date) ======"

# Run high-value fund updates first (priority)
echo "🏛️ [1/2] Running high-value fund updates..."
./run.sh funds-high

echo ""
echo "💰 [2/2] Running regular fund updates..."
./run.sh funds

echo "====== CRON FUNDS SUITE FINISHED: $(date) ======"