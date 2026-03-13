#!/bin/bash
# ZLAR Gateway — Stop Script
# Stops the Mac API and Gateway.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$PROJECT_DIR/.zlar-mac-api.pid" ]; then
  kill $(cat "$PROJECT_DIR/.zlar-mac-api.pid") 2>/dev/null
  rm "$PROJECT_DIR/.zlar-mac-api.pid"
  echo "[ZLAR] Mac API stopped."
fi

if [ -f "$PROJECT_DIR/.zlar-gateway.pid" ]; then
  kill $(cat "$PROJECT_DIR/.zlar-gateway.pid") 2>/dev/null
  rm "$PROJECT_DIR/.zlar-gateway.pid"
  echo "[ZLAR] Gateway stopped."
fi

# Fallback: kill by port
kill $(lsof -ti :3000) 2>/dev/null
kill $(lsof -ti :4000) 2>/dev/null

echo "[ZLAR] All processes stopped."
