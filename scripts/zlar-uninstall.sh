#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# ZLAR-CC Uninstall
#
# Removes ZLAR-CC hook configuration and optionally cleans up data files.
# Does NOT delete the repository itself — just the system integration.
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "${SCRIPT_DIR}")"

echo "═══════════════════════════════════════════════════════"
echo " ZLAR-CC Uninstall"
echo "═══════════════════════════════════════════════════════"
echo ""

# 1. Remove hook from Claude Code settings
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
if [ -f "${CLAUDE_SETTINGS}" ]; then
    if grep -q "zlar" "${CLAUDE_SETTINGS}" 2>/dev/null; then
        echo "⚠️  Claude Code settings contain ZLAR hook references."
        echo "   File: ${CLAUDE_SETTINGS}"
        echo "   You must manually remove the PreToolUse hook entry."
        echo "   (Automated editing of settings.json risks breaking other config.)"
        echo ""
    else
        echo "✓ No ZLAR hooks found in Claude Code settings."
    fi
else
    echo "✓ No Claude Code settings file found."
fi

# 2. Remove wrapper script if it exists
WRAPPER="$HOME/.claude/zlar-gate.sh"
if [ -f "${WRAPPER}" ]; then
    echo -n "Remove hook wrapper (${WRAPPER})? [y/N] "
    read -r answer
    if [ "${answer}" = "y" ] || [ "${answer}" = "Y" ]; then
        rm -f "${WRAPPER}"
        echo "✓ Hook wrapper removed."
    else
        echo "  Skipped."
    fi
else
    echo "✓ No hook wrapper found."
fi

# 3. Remove firewall rules if hardened
if sudo pfctl -sr 2>/dev/null | grep -q "zlar" 2>/dev/null; then
    echo ""
    echo "⚠️  ZLAR firewall rules detected."
    echo "   Run: ${PROJECT_DIR}/scripts/zlar-unharden.sh"
    echo "   to remove packet filter rules before uninstalling."
    echo ""
fi

# 4. Optionally clean data files
echo ""
echo -n "Remove audit trail, logs, and session data? [y/N] "
read -r answer
if [ "${answer}" = "y" ] || [ "${answer}" = "Y" ]; then
    rm -rf "${PROJECT_DIR}/var/log/"*.jsonl 2>/dev/null || true
    rm -rf "${PROJECT_DIR}/var/log/"*.log 2>/dev/null || true
    rm -rf "${PROJECT_DIR}/var/log/sessions" 2>/dev/null || true
    rm -f "${PROJECT_DIR}/var/log/.gate-active" 2>/dev/null || true
    rm -f "${PROJECT_DIR}/var/log/.telegram-rate" 2>/dev/null || true
    rm -f "${PROJECT_DIR}/var/log/.policy-cache" 2>/dev/null || true
    echo "✓ Data files removed."
else
    echo "  Audit trail and logs preserved."
fi

# 5. Optionally remove signing key
SIGNING_KEY="$HOME/.zlar-signing.key"
if [ -f "${SIGNING_KEY}" ]; then
    echo ""
    echo -n "Remove signing key (${SIGNING_KEY})? [y/N] "
    read -r answer
    if [ "${answer}" = "y" ] || [ "${answer}" = "Y" ]; then
        rm -f "${SIGNING_KEY}"
        echo "✓ Signing key removed."
    else
        echo "  Signing key preserved."
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo " Uninstall complete."
echo ""
echo " To fully remove ZLAR-CC, delete this directory:"
echo " rm -rf ${PROJECT_DIR}"
echo "═══════════════════════════════════════════════════════"
