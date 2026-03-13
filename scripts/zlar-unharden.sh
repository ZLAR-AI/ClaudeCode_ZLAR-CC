#!/bin/bash
# ZLAR Unhardening — Remove egress control
# Removes the pf rules and restores normal outbound connectivity.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "[ZLAR] Removing egress hardening..."

# Stop firewall monitor
if [ -f "$PROJECT_DIR/.zlar-fw-monitor.pid" ]; then
  FW_PID=$(cat "$PROJECT_DIR/.zlar-fw-monitor.pid")
  sudo kill "$FW_PID" 2>/dev/null && echo "[ZLAR] Firewall monitor stopped (PID $FW_PID)" || true
  rm -f "$PROJECT_DIR/.zlar-fw-monitor.pid"
fi

# Remove anchor from pf.conf
sudo sed -i '' '/anchor "zlar"/d' /etc/pf.conf 2>/dev/null
sudo sed -i '' '/load anchor "zlar"/d' /etc/pf.conf 2>/dev/null

# Remove anchor file
sudo rm -f /etc/pf.anchors/zlar

# Destroy pflog0 interface
sudo ifconfig pflog0 destroy 2>/dev/null && echo "[ZLAR] Removed pflog0 interface" || true

# Reload pf
sudo pfctl -f /etc/pf.conf 2>/dev/null

echo "[ZLAR] Egress hardening removed. Normal outbound connectivity restored."
