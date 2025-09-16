#!/usr/bin/env bash
# Cron-compatible script for database maintenance
# Usage in crontab: 0 3 * * 0 /path/to/onchainScanner/scanners/cron/cron-db-maintenance.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# Environment setup
export TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-3600}"  # 1 hour timeout for DB maintenance
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Log file with timestamp
LOG_FILE="$SCRIPT_DIR/logs/cron-db-maintenance-$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$SCRIPT_DIR/logs"

# Execute with proper output redirection
exec >> "$LOG_FILE" 2>&1

echo "====== CRON DB MAINTENANCE STARTED: $(date) ======"

# Step 1: Quick analysis
echo "🔍 [Step 1/3] Database performance analysis..."
./run.sh db-analyze

echo ""

# Step 2: Full optimization with VACUUM
echo "🔧 [Step 2/3] Full database optimization (with VACUUM)..."
./run.sh db-optimize

echo ""

# Step 3: Cleanup old log files (optional)
echo "🧹 [Step 3/3] Cleaning old maintenance logs..."
find "$SCRIPT_DIR/logs" -name "cron-db-maintenance-*.log" -mtime +7 -delete 2>/dev/null || true
echo "✅ Cleaned old maintenance logs (>7 days)"

echo "====== CRON DB MAINTENANCE FINISHED: $(date) ======"