#!/usr/bin/env bash
# Cron-compatible script for full scanner suite
# Usage in crontab: 0 1 * * * /path/to/onchainScanner/scanners/cron/cron-all.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# Environment setup
export TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-14400}"  # Extended timeout for full suite
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Log file with timestamp
LOG_FILE="$SCRIPT_DIR/logs/cron-all-$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$SCRIPT_DIR/logs"

# Execute with proper output redirection
exec >> "$LOG_FILE" 2>&1

echo "====== CRON FULL SUITE STARTED: $(date) ======"

# Run full scanner suite
./run.sh all

echo "====== CRON FULL SUITE FINISHED: $(date) ======"