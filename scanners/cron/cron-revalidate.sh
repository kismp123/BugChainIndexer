#!/usr/bin/env bash
# Cron-compatible script for data revalidation
# Usage in crontab: 0 2 * * 0 /path/to/onchainScanner/scanners/cron/cron-revalidate.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# Environment setup
export TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-7200}"  # Standard timeout for revalidation
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Log file with timestamp
LOG_FILE="$SCRIPT_DIR/logs/cron-revalidate-$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$SCRIPT_DIR/logs"

# Execute with proper output redirection
exec >> "$LOG_FILE" 2>&1

echo "====== CRON DATA REVALIDATION STARTED: $(date) ======"

# Run data revalidation (parallel)
./run.sh revalidate

echo "====== CRON DATA REVALIDATION FINISHED: $(date) ======"