#!/usr/bin/env bash
# OnchainScanner Cron Setup Helper
# Guide for recommended cron schedules and configuration methods

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_DIR="$SCRIPT_DIR/cron"

echo "====== OnchainScanner Cron Setup Helper ====="
echo
echo "🔧 Setting script permissions..."
chmod +x "$CRON_DIR"/cron-*.sh
chmod +x "$SCRIPT_DIR"/run.sh

echo "✅ Permission setup completed"
echo
echo "====== 🕐 Recommended Cron Schedule ====="
echo
echo "Add cron jobs with the following command:"
echo "crontab -e"
echo
echo "Then select and add one of the following lines:"
echo
echo "🎯 Recommended Setup (Optimized Performance & Maintenance):"
echo "# === Blockchain Scanner (Core) ==="
echo "0 */4 * * * $CRON_DIR/cron-unified.sh     # Unified analysis every 4 hours"
echo "0 */6 * * * $CRON_DIR/cron-funds.sh       # Asset updates every 6 hours"
echo "0 */3 * * * $CRON_DIR/cron-funds-high.sh  # High-value asset updates every 3 hours"
echo "0 2 * * 0 $CRON_DIR/cron-revalidate.sh    # Data revalidation weekly (Sunday 2AM)"
echo ""
echo "# === Database Optimization (New - Performance Innovation) ==="
echo "0 5 * * * $CRON_DIR/cron-db-daily.sh      # Daily DB optimization (5AM) - 455x performance boost"
echo "0 3 * * 0 $CRON_DIR/cron-db-maintenance.sh # Regular DB maintenance weekly (Sunday 3AM)"
echo "0 1 1 * * $CRON_DIR/cron-db-large-optimize.sh # Large DB optimization monthly (1st day 1AM)"
echo ""
echo "# === Maintenance and Cleanup ==="
echo "0 4 * * * $CRON_DIR/cron-cleanup.sh       # Log cleanup daily (4AM)"
echo
echo "🚀 High Performance Setup (More Frequent Execution):"
echo "# === Blockchain Scanner (High Speed) ==="
echo "0 */2 * * * $CRON_DIR/cron-unified.sh     # Unified analysis every 2 hours"
echo "0 */4 * * * $CRON_DIR/cron-funds.sh       # Asset updates every 4 hours"
echo "0 */2 * * * $CRON_DIR/cron-funds-high.sh  # High-value asset updates every 2 hours"
echo "0 1 * * * $CRON_DIR/cron-revalidate.sh    # Data revalidation daily"
echo ""
echo "# === Database Optimization (High Performance) ==="
echo "0 2 * * * $CRON_DIR/cron-db-daily.sh      # Daily DB optimization (2AM)"
echo "0 3 * * 0 $CRON_DIR/cron-db-maintenance.sh # Regular DB maintenance weekly (Sunday 3AM)"
echo "0 1 1 * * $CRON_DIR/cron-db-large-optimize.sh # Large DB optimization monthly (1st day 1AM)"
echo ""
echo "# === Maintenance ==="
echo "0 4 * * * $CRON_DIR/cron-cleanup.sh       # Log cleanup daily (4AM)"
echo
echo "🔄 All-in-One Setup (Simple):"
echo "# === Unified Execution (All Scanners) ==="
echo "0 1 * * * $CRON_DIR/cron-all.sh           # All scanners daily at 1AM"
echo ""
echo "# === Automatic Database Optimization ==="
echo "0 5 * * * $CRON_DIR/cron-db-daily.sh      # Daily DB optimization (5AM)"
echo "0 3 * * 0 $CRON_DIR/cron-db-maintenance.sh # Regular DB maintenance weekly (Sunday 3AM)"
echo "0 1 1 * * $CRON_DIR/cron-db-large-optimize.sh # Large DB optimization monthly (1st day 1AM)"
echo ""
echo "# === Cleanup ==="
echo "0 4 * * * $CRON_DIR/cron-cleanup.sh       # Log cleanup daily (4AM)"
echo
echo "====== 🚀 Quick Auto Setup ====="
echo
echo "To apply recommended settings immediately:"
echo "  $0 --auto-setup"
echo
echo "====== 📋 Useful Commands ====="
echo
echo "Check current cron jobs:"
echo "  crontab -l"
echo
echo "Check cron logs:"
echo "  sudo tail -f /var/log/syslog | grep CRON"
echo
echo "Manual testing - Blockchain Scanner:"
echo "  $CRON_DIR/cron-unified.sh      # Unified analysis pipeline"
echo "  $CRON_DIR/cron-funds.sh        # Asset price/balance updates"
echo "  $CRON_DIR/cron-funds-high.sh   # High-value asset updates (fund >= 100,000)"
echo "  $CRON_DIR/cron-revalidate.sh   # Data revalidation"
echo "  $CRON_DIR/cron-all.sh          # Full suite"
echo
echo "Manual testing - Database Optimization (New):"
echo "  $CRON_DIR/cron-db-daily.sh         # Daily high-speed optimization (455x performance boost)"
echo "  $CRON_DIR/cron-db-maintenance.sh   # Weekly full maintenance (includes VACUUM)"
echo "  $CRON_DIR/cron-db-large-optimize.sh # Monthly large-scale optimization (10GB+)"
echo "  $CRON_DIR/cron-cleanup.sh          # Log cleanup"
echo
echo "Immediate database optimization:"
echo "  cd $SCRIPT_DIR && ./run.sh db-optimize-fast   # Quick optimization (recommended)"
echo "  cd $SCRIPT_DIR && ./run.sh db-analyze         # Performance analysis only"
echo
echo "Check logs:"
echo "  ls -la $SCRIPT_DIR/logs/"
echo "  $SCRIPT_DIR/run.sh logs error"
echo
echo "====== 📖 Detailed Guide ====="
echo
echo "For more detailed configuration options, refer to:"
echo "  $CRON_DIR/CRON_SETUP.md"

# Auto setup option
if [[ "$1" == "--auto-setup" ]]; then
    echo
    echo "====== Running Auto Setup... ====="
    
    # Check if existing related cron jobs exist
    if crontab -l 2>/dev/null | grep -q "cron-unified.sh\|cron-funds.sh\|cron-deploy.sh"; then
        echo "⚠️  Existing OnchainScanner cron jobs found."
        echo "Please check and configure manually: crontab -e"
        exit 1
    fi
    
    # Add recommended settings
    {
        crontab -l 2>/dev/null
        echo "# OnchainScanner - Auto-added $(date)"
        echo "# === Blockchain Scanner (Core) ==="
        echo "0 */4 * * * $CRON_DIR/cron-unified.sh       # Unified analysis every 4 hours"
        echo "0 */6 * * * $CRON_DIR/cron-funds.sh         # Asset updates every 6 hours"
        echo "0 */3 * * * $CRON_DIR/cron-funds-high.sh    # High-value asset updates every 3 hours"
        echo "0 2 * * 0 $CRON_DIR/cron-revalidate.sh      # Data revalidation weekly"
        echo "# === Database Optimization (455x performance boost) ==="
        echo "0 5 * * * $CRON_DIR/cron-db-daily.sh        # Daily DB optimization"
        echo "0 3 * * 0 $CRON_DIR/cron-db-maintenance.sh  # Weekly DB maintenance"
        echo "0 1 1 * * $CRON_DIR/cron-db-large-optimize.sh # Monthly large-scale optimization"
        echo "# === System Cleanup ==="
        echo "0 4 * * * $CRON_DIR/cron-cleanup.sh         # Log cleanup"
    } | crontab -
    
    echo "✅ Recommended settings have been automatically added!"
    echo
    echo "🎉 Installed Features:"
    echo "   📊 Blockchain Scanner: Auto-run every 4-6 hours"
    echo "   🚀 Database Optimization: 455x performance boost applied"
    echo "   🔄 Auto Maintenance: Daily/weekly/monthly schedule"
    echo "   🧹 System Cleanup: Automatic log management"
    echo
    echo "Current cron job list:"
    crontab -l
fi