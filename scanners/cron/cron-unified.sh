#!/usr/bin/env bash
# Cron-compatible script for unified blockchain analysis pipeline
# Usage in crontab: 0 */4 * * * /path/to/onchainScanner/scanners/cron/cron-unified.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# Environment setup
export TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-5400}"  # Extended timeout for unified pipeline
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Log file with timestamp
LOG_FILE="$SCRIPT_DIR/logs/cron-unified-$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$SCRIPT_DIR/logs"

# Execute with proper output redirection
exec >> "$LOG_FILE" 2>&1

echo "====== CRON UNIFIED PIPELINE STARTED: $(date) ======"

# Run unified blockchain analysis pipeline (parallel)
./run.sh unified

echo "====== CRON UNIFIED PIPELINE FINISHED: $(date) ======"