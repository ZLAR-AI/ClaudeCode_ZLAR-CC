#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# ZLAR v2 — Start / Verify Script
#
# No servers to start. ZLAR v2 runs as a synchronous hook.
# This script verifies the system is ready and prints status.
#
# Usage: ./scripts/zlar-start.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "${SCRIPT_DIR}")"

cd "${PROJECT_DIR}"

# Load .env if present
if [ -f .env ]; then
    set -a
    . .env
    set +a
fi

PASS=0
FAIL=0
WARN=0

check() {
    local label="$1" result="$2"
    if [ "${result}" = "pass" ]; then
        printf "  ✓  %s\n" "${label}"
        PASS=$((PASS + 1))
    elif [ "${result}" = "warn" ]; then
        printf "  ⚠  %s\n" "${label}"
        WARN=$((WARN + 1))
    else
        printf "  ✗  %s\n" "${label}"
        FAIL=$((FAIL + 1))
    fi
}

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ZLAR v2 — System Verification"
echo "═══════════════════════════════════════════════════"
echo ""

# 1. Gate script
if [ -x bin/zlar-gate ]; then
    check "Gate script executable" "pass"
else
    check "Gate script executable (bin/zlar-gate)" "fail"
fi

# 2. Hook wrapper
if [ -x .claude/hooks/zlar-gate.sh ]; then
    check "Hook wrapper executable" "pass"
else
    check "Hook wrapper executable (.claude/hooks/zlar-gate.sh)" "fail"
fi

# 3. Policy file
if [ -f etc/policies/active.policy.json ]; then
    check "Active policy deployed" "pass"
else
    check "Active policy deployed (etc/policies/active.policy.json)" "fail"
fi

# 4. Policy signature
if [ -f etc/keys/policy-signing.pub ]; then
    if bin/zlar-policy verify --input etc/policies/active.policy.json 2>&1 | grep -q "VALID"; then
        check "Policy signature valid" "pass"
    else
        check "Policy signature valid" "fail"
    fi
else
    check "Policy signing key (etc/keys/policy-signing.pub)" "fail"
fi

# 5. jq available
if command -v jq &>/dev/null; then
    check "jq available" "pass"
else
    check "jq available" "fail"
fi

# 6. openssl available
if command -v openssl &>/dev/null; then
    check "openssl available" "pass"
else
    check "openssl available" "fail"
fi

# 7. Telegram token
TELEGRAM_TOKEN="${ZLAR_TELEGRAM_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}"
if [ -n "${TELEGRAM_TOKEN}" ]; then
    check "Telegram token set" "pass"
else
    check "Telegram token set (ZLAR_TELEGRAM_TOKEN)" "warn"
fi

# 8. Telegram reachable (quick check)
if [ -n "${TELEGRAM_TOKEN}" ]; then
    if curl -s --connect-timeout 3 "https://api.telegram.org/bot${TELEGRAM_TOKEN}/getMe" | jq -r '.ok' 2>/dev/null | grep -q "true"; then
        check "Telegram API reachable" "pass"
    else
        check "Telegram API reachable" "fail"
    fi
fi

# 9. Log directory
mkdir -p var/log 2>/dev/null || true
if [ -d var/log ] && [ -w var/log ]; then
    check "Log directory writable" "pass"
else
    check "Log directory writable (var/log/)" "fail"
fi

# 10. Intelligence tools
TOOLS_OK=0
TOOLS_TOTAL=0
for tool in zlar-karma zlar-availability zlar-brief zlar-audit zlar-journal zlar-health zlar-policy; do
    TOOLS_TOTAL=$((TOOLS_TOTAL + 1))
    if [ -x "bin/${tool}" ]; then
        TOOLS_OK=$((TOOLS_OK + 1))
    fi
done
if [ "${TOOLS_OK}" -eq "${TOOLS_TOTAL}" ]; then
    check "Intelligence tools (${TOOLS_OK}/${TOOLS_TOTAL})" "pass"
else
    check "Intelligence tools (${TOOLS_OK}/${TOOLS_TOTAL})" "fail"
fi

# 11. Hooks config
if [ -f .claude/settings.json ]; then
    if jq -e '.hooks.PreToolUse' .claude/settings.json &>/dev/null; then
        check "Claude Code hooks configured" "pass"
    else
        check "Claude Code hooks configured" "fail"
    fi
else
    check "Claude Code hooks config (.claude/settings.json)" "fail"
fi

echo ""
echo "─────────────────────────────────────────────────"
printf "  Results: %d passed, %d warnings, %d failed\n" "${PASS}" "${WARN}" "${FAIL}"
echo "─────────────────────────────────────────────────"

if [ "${FAIL}" -eq 0 ]; then
    echo ""
    echo "  ZLAR v2 is ready. Hooks will gate all Claude Code tool calls."
    echo ""
    echo "  Quick reference:"
    echo "    bin/zlar-policy inspect    — view active policy"
    echo "    bin/zlar-karma score       — current trust score"
    echo "    bin/zlar-availability status — check mode"
    echo "    bin/zlar-brief             — morning dashboard"
    echo "    bin/zlar-health --since 1d — policy health"
    echo ""
else
    echo ""
    echo "  ⚠  Fix the failures above before using ZLAR."
    echo ""
    exit 1
fi
