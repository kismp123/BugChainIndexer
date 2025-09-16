#!/usr/bin/env bash
# Cron-compatible script for daily database optimization (fast mode)
# Usage in crontab: 0 5 * * * /path/to/onchainScanner/scanners/cron/cron-db-daily.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# Environment setup
export TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-300}"  # 5 minutes timeout for fast optimization
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Log file with timestamp
LOG_FILE="$SCRIPT_DIR/logs/cron-db-daily-$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$SCRIPT_DIR/logs"

# Execute with proper output redirection
exec >> "$LOG_FILE" 2>&1

echo "====== CRON DB DAILY OPTIMIZATION STARTED: $(date) ======"

# Fast optimization (skip VACUUM for daily use)
echo "⚡ Running fast database optimization (skip VACUUM)..."
./run.sh db-optimize-fast

echo "====== CRON DB DAILY OPTIMIZATION FINISHED: $(date) ======"