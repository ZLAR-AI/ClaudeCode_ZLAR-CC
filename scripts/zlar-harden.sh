#!/bin/bash
# ZLAR Hardening — macOS Egress Control
# =======================================
# This script applies packet filter rules that block all outbound TCP traffic
# except through the ZLAR gateway. This closes the "assume breach" gap.
#
# WHAT THIS DOES:
# - Copies pf rules to /etc/pf.anchors/zlar
# - Adds ZLAR anchor to /etc/pf.conf
# - Enables the packet filter
#
# REQUIRES: sudo
# REVERSIBLE: Run zlar-unharden.sh to remove
#
# WARNING: This blocks direct outbound connections. Your browser, curl,
# and other apps won't be able to reach the internet directly.
# Only the ZLAR mac-api process can make outbound calls.
# Make sure ZLAR is running BEFORE applying these rules.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "[ZLAR] ============================================"
echo "[ZLAR]  ZLAR Egress Hardening"
echo "[ZLAR] ============================================"
echo ""
echo "[ZLAR] This will block all direct outbound TCP traffic."
echo "[ZLAR] Only the ZLAR gateway will be able to reach the internet."
echo ""

# Check ZLAR is running
if ! lsof -ti :3000 > /dev/null 2>&1; then
  echo "[ZLAR] ERROR: Gateway not running on port 3000."
  echo "[ZLAR] Start ZLAR first: ./scripts/zlar-start.sh"
  exit 1
fi

if ! lsof -ti :4000 > /dev/null 2>&1; then
  echo "[ZLAR] ERROR: Mac API not running on port 4000."
  echo "[ZLAR] Start ZLAR first: ./scripts/zlar-start.sh"
  exit 1
fi

echo "[ZLAR] ZLAR is running. Proceeding with hardening."
echo ""

read -p "[ZLAR] Apply firewall rules? This blocks direct outbound. (y/N) " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "[ZLAR] Aborted."
  exit 0
fi

# Copy rules
sudo cp "$PROJECT_DIR/config/pf-zlar.conf" /etc/pf.anchors/zlar
echo "[ZLAR] Rules copied to /etc/pf.anchors/zlar"

# Check if anchor already exists
if ! grep -q 'anchor "zlar"' /etc/pf.conf 2>/dev/null; then
  echo 'anchor "zlar"' | sudo tee -a /etc/pf.conf > /dev/null
  echo 'load anchor "zlar" from "/etc/pf.anchors/zlar"' | sudo tee -a /etc/pf.conf > /dev/null
  echo "[ZLAR] Anchor added to /etc/pf.conf"
else
  echo "[ZLAR] Anchor already in /etc/pf.conf"
fi

# Apply and enable
sudo pfctl -f /etc/pf.conf 2>/dev/null
sudo pfctl -e 2>/dev/null

# Create pflog0 interface for block monitoring
if ! ifconfig pflog0 > /dev/null 2>&1; then
  sudo ifconfig pflog0 create
  echo "[ZLAR] Created pflog0 interface for block logging"
else
  echo "[ZLAR] pflog0 already exists"
fi

# Start firewall monitor (sends Telegram alerts for blocked connections)
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
  # tcpdump needs root, so we run the monitor with sudo
  sudo -E npx tsx "$PROJECT_DIR/packages/firewall-monitor/src/index.ts" > /tmp/zlar-fw-monitor.log 2>&1 &
  FW_PID=$!
  echo "$FW_PID" > "$PROJECT_DIR/.zlar-fw-monitor.pid"
  echo "[ZLAR] Firewall monitor started (PID $FW_PID)"
else
  echo "[ZLAR] WARNING: No TELEGRAM_BOT_TOKEN — firewall monitor not started"
fi

echo ""
echo "[ZLAR] ============================================"
echo "[ZLAR]  Egress hardening ACTIVE"
echo "[ZLAR]  All outbound TCP is blocked."
echo "[ZLAR]  Only ZLAR can reach the internet."
echo "[ZLAR]  Blocked connections → Telegram alerts"
echo "[ZLAR]  To reverse: ./scripts/zlar-unharden.sh"
echo "[ZLAR] ============================================"
