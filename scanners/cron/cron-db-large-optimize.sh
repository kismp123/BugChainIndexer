#!/usr/bin/env bash
# Cron-compatible script for large dataset optimization (monthly)
# Usage in crontab: 0 1 1 * * /path/to/onchainScanner/scanners/cron/cron-db-large-optimize.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# Environment setup
export TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-7200}"  # 2 hours timeout for large optimization
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Log file with timestamp
LOG_FILE="$SCRIPT_DIR/logs/cron-db-large-optimize-$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$SCRIPT_DIR/logs"

# Execute with proper output redirection
exec >> "$LOG_FILE" 2>&1

echo "====== CRON LARGE DB OPTIMIZATION STARTED: $(date) ======"

# Step 1: Pre-optimization analysis
echo "📊 [Step 1/4] Pre-optimization database analysis..."
./run.sh db-analyze

echo ""

# Step 2: Basic cleanup first
echo "🧹 [Step 2/4] Basic database cleanup..."
./run.sh db-cleanup

echo ""

# Step 3: Large dataset optimization
echo "🚀 [Step 3/4] Large dataset optimization..."
./run.sh db-optimize-large

echo ""

# Step 4: Post-optimization analysis
echo "📊 [Step 4/4] Post-optimization verification..."
./run.sh db-analyze

echo ""

# Cleanup old large optimization logs (keep last 3 months)
echo "🗑️  Cleaning old large optimization logs..."
find "$SCRIPT_DIR/logs" -name "cron-db-large-optimize-*.log" -mtime +90 -delete 2>/dev/null || true
echo "✅ Cleaned old large optimization logs (>90 days)"

echo "====== CRON LARGE DB OPTIMIZATION FINISHED: $(date) ======"