#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# ZLAR Gate — Claude Code PreToolUse Hook Wrapper
#
# Thin wrapper that pipes hook stdin to bin/zlar-gate.
# FAIL-CLOSED: If the gate script crashes or is missing, ALL actions DENIED.
# ═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "${SCRIPT_DIR}")")"
GATE="${PROJECT_DIR}/bin/zlar-gate"

# Fail-closed: gate must exist and be executable
if [ ! -x "${GATE}" ]; then
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"ZLAR gate not found or not executable. All actions blocked."}}'
    exit 0
fi

# Pipe stdin to gate. Stderr goes to gate.log for diagnostics.
# If gate crashes (non-zero exit), deny.
RESPONSE=$("${GATE}" 2>>"${PROJECT_DIR}/var/log/gate-stderr.log")
EXIT_CODE=$?

if [ ${EXIT_CODE} -ne 0 ] || [ -z "${RESPONSE}" ]; then
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"ZLAR gate error (exit '"${EXIT_CODE}"'). All actions blocked."}}'
    exit 0
fi

echo "${RESPONSE}"
exit 0
