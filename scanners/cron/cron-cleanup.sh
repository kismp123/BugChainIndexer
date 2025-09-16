#!/usr/bin/env bash
# Cron-compatible script for log cleanup
# Usage in crontab: 0 4 * * * /path/to/onchainScanner/scanners/cron/cron-cleanup.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# Environment setup
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Log file with timestamp
LOG_FILE="$SCRIPT_DIR/logs/cron-cleanup-$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$SCRIPT_DIR/logs"

# Execute with proper output redirection
exec >> "$LOG_FILE" 2>&1

echo "====== CRON LOG CLEANUP STARTED: $(date) ======"

# Clean old logs (>3 days)
./run.sh clean

echo "====== CRON LOG CLEANUP FINISHED: $(date) ======"