#!/usr/bin/env bash
# Cron-compatible script for ERC20 Approval event scanning
# Usage in crontab: 0 */6 * * * /path/to/scanners/cron/cron-approval.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# Environment setup
export TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-3600}"
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Log file with timestamp
LOG_FILE="$SCRIPT_DIR/logs/cron-approval-$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$SCRIPT_DIR/logs"

# Execute with proper output redirection
exec >> "$LOG_FILE" 2>&1

echo "====== CRON APPROVAL PIPELINE STARTED: $(date) ======"

# Run approval event scanner (parallel)
./run.sh approval

echo "====== CRON APPROVAL PIPELINE FINISHED: $(date) ======"
