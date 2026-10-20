#!/usr/bin/env bash
# ==============================================================================
# tools/pass_bridge.sh - Companion CLI Sync Utility
# Bridges unix 'pass' CLI (~/.password-store) with MEIL JSON Vault.
# ==============================================================================
set -euo pipefail

ACTION="${1:-status}"
VAULT_FILE="${2:-memory_vault.json}"

print_usage() {
    cat << EOF
Usage: $0 [COMMAND] [VAULT_FILE]

Commands:
  status        Show pass store and vault sync status
  import        Import from JSON vault into pass CLI
  git-push      Commit and push pass repo to remote GitHub origin
  help          Display this help message

Default VAULT_FILE: memory_vault.json
EOF
}

check_dependencies() {
    command -v pass >/dev/null 2>&1 || { echo "[ERROR] 'pass' CLI is not installed." >&2; exit 1; }
    command -v git >/dev/null 2>&1 || { echo "[ERROR] 'git' is not installed." >&2; exit 1; }
}

cmd_status() {
    echo "=================================================="
    echo " MEIL :: PASS CLI BRIDGE STATUS"
    echo "=================================================="
    echo "Password Store Dir : ${PASSWORD_STORE_DIR:-$HOME/.password-store}"
    if [ -d "${PASSWORD_STORE_DIR:-$HOME/.password-store}" ]; then
        echo "Password Store     : [ONLINE]"
        echo "Stored Passwords   : $(find "${PASSWORD_STORE_DIR:-$HOME/.password-store}" -name "*.gpg" | wc -l)"
    else
        echo "Password Store     : [NOT INITIALIZED]"
    fi

    if [ -f "$VAULT_FILE" ]; then
        echo "Local Vault File   : $VAULT_FILE [FOUND]"
    else
        echo "Local Vault File   : $VAULT_FILE [NOT FOUND - export from Web TUI first]"
    fi
}

cmd_import() {
    if [ ! -f "$VAULT_FILE" ]; then
        echo "[ERROR] Vault file '$VAULT_FILE' not found."
        echo "Export your vault from Screen 3 (Settings) in the Web TUI first."
        exit 1
    fi

    echo "[INFO] Reading $VAULT_FILE..."
    if ! command -v jq >/dev/null 2>&1; then
        echo "[WARN] 'jq' not found. Please install jq for automated JSON parsing, or use 'pass_import.sh' downloaded from the web UI."
        exit 1
    fi

    local pass_count
    pass_count=$(jq '.passwords | length' "$VAULT_FILE")
    echo "[INFO] Found $pass_count passwords in vault."

    for ((i=0; i<pass_count; i++)); do
        local path username password notes
        path=$(jq -r ".passwords[$i].path" "$VAULT_FILE")
        username=$(jq -r ".passwords[$i].username // empty" "$VAULT_FILE")
        password=$(jq -r ".passwords[$i].password // empty" "$VAULT_FILE")
        notes=$(jq -r ".passwords[$i].notes // empty" "$VAULT_FILE")

        if [ -n "$path" ] && [ "$path" != "null" ]; then
            echo "-> Syncing pass entry: $path"
            pass insert -m -f "$path" << EOF_ENTRY
$password
${username:+username: $username}
${notes:+notes: $notes}
EOF_ENTRY
        fi
    done

    echo "[SUCCESS] Passwords synced into pass store."
}

cmd_git_push() {
    echo "[INFO] Running 'pass git push'..."
    pass git push origin main || pass git push origin master
}

# --- Main Dispatcher ---
check_dependencies

case "$ACTION" in
    status)
        cmd_status
        ;;
    import)
        cmd_import
        ;;
    git-push|push)
        cmd_git_push
        ;;
    help|--help|-h)
        print_usage
        ;;
    *)
        echo "[ERROR] Unknown action '$ACTION'"
        print_usage
        exit 1
        ;;
esac
