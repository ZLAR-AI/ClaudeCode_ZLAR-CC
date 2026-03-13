#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# ZLAR-CC Setup — One-command install for Claude Code users
#
# Checks prerequisites, copies config templates, generates signing keys,
# signs the default policy, and configures Claude Code hooks.
#
# Usage: ./scripts/zlar-setup.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "${SCRIPT_DIR}")"

cd "${PROJECT_DIR}"

# Colors
if [ -t 1 ]; then
    RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
    BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
else
    RED=''; GREEN=''; YELLOW=''; BLUE=''; BOLD=''; NC=''
fi

ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
fail() { echo -e "${RED}  ✗${NC} $*" >&2; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; }
info() { echo -e "${BLUE}  ℹ${NC} $*"; }

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  ZLAR-CC Setup${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

ERRORS=0

# ─── Step 1: Check prerequisites ─────────────────────────────────────────────

echo -e "${BOLD}Step 1: Prerequisites${NC}"
echo ""

# jq
if command -v jq &>/dev/null; then
    ok "jq $(jq --version 2>/dev/null || echo '')"
else
    fail "jq is required but not installed"
    echo "       Install: brew install jq (macOS) or apt install jq (Linux)"
    ERRORS=$((ERRORS + 1))
fi

# openssl
if command -v openssl &>/dev/null; then
    OPENSSL_VERSION=$(openssl version 2>/dev/null || echo "unknown")
    ok "openssl (${OPENSSL_VERSION})"
    # Check for Ed25519 support
    if openssl genpkey -algorithm ed25519 -out /dev/null 2>/dev/null; then
        ok "Ed25519 support confirmed"
    else
        fail "openssl does not support Ed25519"
        echo "       macOS users: brew install openssl && export PATH=\"\$(brew --prefix openssl)/bin:\$PATH\""
        ERRORS=$((ERRORS + 1))
    fi
else
    fail "openssl is required but not installed"
    ERRORS=$((ERRORS + 1))
fi

# curl
if command -v curl &>/dev/null; then
    ok "curl"
else
    fail "curl is required but not installed"
    ERRORS=$((ERRORS + 1))
fi

# bash version (need 4+ for some features)
BASH_MAJOR="${BASH_VERSINFO[0]:-0}"
if [ "${BASH_MAJOR}" -ge 4 ]; then
    ok "bash ${BASH_VERSION}"
else
    warn "bash ${BASH_VERSION} — bash 4+ recommended (macOS default is 3.x)"
    echo "       Install: brew install bash"
fi

echo ""

if [ "${ERRORS}" -gt 0 ]; then
    fail "Fix the ${ERRORS} error(s) above before continuing."
    exit 1
fi

# ─── Step 2: Config files ────────────────────────────────────────────────────

echo -e "${BOLD}Step 2: Configuration${NC}"
echo ""

# gate.json
if [ ! -f etc/gate.json ]; then
    cp etc/gate.example.json etc/gate.json
    ok "Created etc/gate.json from template"
else
    ok "etc/gate.json already exists"
fi

# policy
if [ ! -f etc/policies/active.policy.json ]; then
    cp etc/policies/default.policy.example.json etc/policies/active.policy.json
    ok "Created etc/policies/active.policy.json from template"
else
    ok "etc/policies/active.policy.json already exists"
fi

# .env
if [ ! -f .env ]; then
    cp .env.example .env
    ok "Created .env from template"
    warn "You need to edit .env — add your Telegram bot token"
else
    ok ".env already exists"
fi

# Ensure directories exist
mkdir -p var/log etc/keys var/log/sessions 2>/dev/null
ok "Log and key directories ready"

echo ""

# ─── Step 3: Telegram configuration ─────────────────────────────────────────

echo -e "${BOLD}Step 3: Telegram${NC}"
echo ""

# Load .env
if [ -f .env ]; then
    set -a; . .env; set +a
fi

TELEGRAM_TOKEN="${ZLAR_TELEGRAM_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}"

if [ -z "${TELEGRAM_TOKEN}" ]; then
    warn "No Telegram bot token found in .env"
    echo ""
    echo "       To set up Telegram approval:"
    echo "       1. Message @BotFather on Telegram → /newbot → get your token"
    echo "       2. Message @userinfobot on Telegram → get your chat ID"
    echo "       3. Edit .env: TELEGRAM_BOT_TOKEN=your_token_here"
    echo "       4. Edit etc/gate.json: set telegram.chat_id to your chat ID"
    echo "       5. Edit etc/policies/active.policy.json: set author to your name"
    echo ""
    warn "ZLAR-CC will work without Telegram — 'ask' actions will time out and deny"
else
    ok "Telegram token found"
    # Quick connectivity check
    if curl -s --connect-timeout 3 "https://api.telegram.org/bot${TELEGRAM_TOKEN}/getMe" | jq -r '.ok' 2>/dev/null | grep -q "true"; then
        BOT_NAME=$(curl -s "https://api.telegram.org/bot${TELEGRAM_TOKEN}/getMe" | jq -r '.result.username // "unknown"' 2>/dev/null)
        ok "Telegram API reachable (bot: @${BOT_NAME})"
    else
        fail "Telegram token is invalid or API unreachable"
    fi
fi

CHAT_ID=$(jq -r '.telegram.chat_id // ""' etc/gate.json 2>/dev/null)
if [ -n "${CHAT_ID}" ] && [ "${CHAT_ID}" != "YOUR_TELEGRAM_CHAT_ID" ]; then
    ok "Telegram chat ID configured: ${CHAT_ID}"
else
    warn "Telegram chat ID not set in etc/gate.json"
    echo "       Get your chat ID: message @userinfobot on Telegram"
fi

echo ""

# ─── Step 4: Generate signing keys ──────────────────────────────────────────

echo -e "${BOLD}Step 4: Signing Keys${NC}"
echo ""

if [ -f etc/keys/policy-signing.pub ] && [ -f "${HOME}/.zlar-signing.key" ]; then
    ok "Signing keypair already exists"
    info "Private key: ~/.zlar-signing.key"
    info "Public key: etc/keys/policy-signing.pub"
else
    info "Generating Ed25519 signing keypair..."
    bin/zlar-policy keygen
fi

echo ""

# ─── Step 5: Sign policy ────────────────────────────────────────────────────

echo -e "${BOLD}Step 5: Sign Policy${NC}"
echo ""

if [ -f etc/keys/policy-signing.pub ] && [ -f "${HOME}/.zlar-signing.key" ]; then
    bin/zlar-policy sign --input etc/policies/active.policy.json --key "${HOME}/.zlar-signing.key"
    ok "Policy signed"
else
    warn "Cannot sign policy — keys not generated yet"
fi

echo ""

# ─── Step 6: Configure Claude Code hooks ─────────────────────────────────────

echo -e "${BOLD}Step 6: Claude Code Hooks${NC}"
echo ""

HOOKS_DIR="${HOME}/.claude"
SETTINGS_FILE="${HOOKS_DIR}/settings.json"
HOOK_CMD="${PROJECT_DIR}/.claude/hooks/zlar-gate.sh"

# Ensure gate scripts are executable
chmod +x bin/zlar-gate .claude/hooks/zlar-gate.sh 2>/dev/null
ok "Gate scripts marked executable"

# Check if Claude Code settings already have ZLAR hooks
if [ -f "${SETTINGS_FILE}" ]; then
    if jq -e '.hooks.PreToolUse' "${SETTINGS_FILE}" &>/dev/null; then
        if grep -q "zlar" "${SETTINGS_FILE}" 2>/dev/null; then
            ok "Claude Code hooks already configured with ZLAR"
            info "Settings: ${SETTINGS_FILE}"
        else
            warn "Claude Code hooks exist but don't reference ZLAR"
            echo ""
            echo "       Add this to your ~/.claude/settings.json hooks.PreToolUse array:"
            echo ""
            echo "       {"
            echo "         \"type\": \"command\","
            echo "         \"command\": \"${HOOK_CMD}\","
            echo "         \"timeout\": 310"
            echo "       }"
        fi
    else
        # Settings exist but no hooks — add them
        TEMP_SETTINGS=$(mktemp)
        jq --arg cmd "${HOOK_CMD}" \
            '. + {"hooks": {"PreToolUse": [{"type": "command", "command": $cmd, "timeout": 310}]}}' \
            "${SETTINGS_FILE}" > "${TEMP_SETTINGS}" 2>/dev/null
        if [ -s "${TEMP_SETTINGS}" ]; then
            mv "${TEMP_SETTINGS}" "${SETTINGS_FILE}"
            ok "Added ZLAR hooks to existing ~/.claude/settings.json"
        else
            rm -f "${TEMP_SETTINGS}"
            warn "Could not auto-configure hooks"
            echo "       Add manually — see above"
        fi
    fi
else
    # No settings file — create one
    mkdir -p "${HOOKS_DIR}"
    jq -n --arg cmd "${HOOK_CMD}" \
        '{"hooks": {"PreToolUse": [{"type": "command", "command": $cmd, "timeout": 310}]}}' \
        > "${SETTINGS_FILE}"
    ok "Created ~/.claude/settings.json with ZLAR hooks"
fi

echo ""

# ─── Step 7: Verify ─────────────────────────────────────────────────────────

echo -e "${BOLD}Step 7: Verification${NC}"
echo ""

./scripts/zlar-start.sh 2>/dev/null && true

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Setup complete.${NC}"
echo ""
echo "  Next steps:"
echo "    1. Edit etc/gate.json — set your Telegram chat ID"
echo "    2. Edit .env — add your Telegram bot token"
echo "    3. Review etc/policies/active.policy.json — customize rules"
echo "    4. Re-sign after policy changes: bin/zlar-policy sign --input etc/policies/active.policy.json --key ~/.zlar-signing.key"
echo "    5. Open Claude Code — ZLAR is now gating every tool call"
echo ""
echo "  Verify anytime:  ./scripts/zlar-start.sh"
echo "  Morning brief:   bin/zlar-brief"
echo "  Audit trail:     bin/zlar-audit"
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
