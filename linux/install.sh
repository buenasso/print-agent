#!/usr/bin/env bash
# install.sh — Instalador do OF Print Agent para Ubuntu
# Uso: curl -fsSL <url> | bash
#      ou: bash install.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $1"; }
err()  { echo -e "  ${RED}✗${RESET} $1"; }
step() { echo -e "\n  ${BOLD}$1${RESET}"; }

echo -e "\n  ${BOLD}OF Print Agent — Instalador Linux${RESET}\n"

# ── Verifica Ubuntu ───────────────────────────────────────────────────────────

if ! command -v apt-get &>/dev/null; then
    err "Este instalador requer Ubuntu/Debian (apt-get não encontrado)."
    exit 1
fi

# ── Node.js ≥ 20 ──────────────────────────────────────────────────────────────

step "1/4 — Verificando Node.js..."

NODE_OK=false
if command -v node &>/dev/null; then
    NODE_VER=$(node -e 'process.stdout.write(process.version)' | sed 's/v//')
    MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
    if [ "$MAJOR" -ge 20 ]; then
        ok "Node.js v${NODE_VER} encontrado."
        NODE_OK=true
    else
        warn "Node.js v${NODE_VER} é muito antigo (mínimo: v20)."
    fi
fi

if [ "$NODE_OK" = false ]; then
    echo "  Instalando Node.js 20 LTS via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - &>/dev/null
    sudo apt-get install -y nodejs &>/dev/null
    ok "Node.js $(node -v) instalado."
fi

# ── Chromium ──────────────────────────────────────────────────────────────────

step "2/4 — Verificando Chromium..."

if command -v chromium-browser &>/dev/null || command -v chromium &>/dev/null; then
    ok "Chromium encontrado."
else
    echo "  Instalando Chromium via apt..."
    sudo apt-get install -y chromium-browser &>/dev/null || \
    sudo apt-get install -y chromium &>/dev/null
    ok "Chromium instalado."
fi

# Detecta o caminho real do Chromium e ajusta o config se necessário
CHROM_PATH=""
for candidate in /usr/bin/chromium-browser /usr/bin/chromium /snap/bin/chromium; do
    if [ -x "$candidate" ]; then
        CHROM_PATH="$candidate"
        break
    fi
done

if [ -z "$CHROM_PATH" ]; then
    warn "Chromium instalado mas caminho não detectado automaticamente."
    warn "Ajuste CHROMIUM_PATH em linux/src/config.js após a instalação."
else
    ok "Chromium em: $CHROM_PATH"
fi

# ── CUPS ──────────────────────────────────────────────────────────────────────

step "3/5 — Verificando CUPS..."

if command -v lpstat &>/dev/null; then
    ok "CUPS encontrado."
else
    echo "  Instalando CUPS..."
    sudo apt-get install -y cups &>/dev/null
    ok "CUPS instalado."
fi

# ── Fontes ────────────────────────────────────────────────────────────────────

step "4/5 — Verificando fontes para renderização de etiquetas..."

if fc-list | grep -qi "liberation"; then
    ok "Liberation fonts encontradas."
else
    echo "  Instalando Liberation fonts..."
    sudo apt-get install -y fonts-liberation &>/dev/null
    ok "Liberation fonts instaladas."
fi

# ── Print Agent ───────────────────────────────────────────────────────────────

step "5/5 — Instalando OF Print Agent..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/package.json" ]; then
    # Instalação local (git clone)
    cd "$SCRIPT_DIR"
    npm install --omit=dev &>/dev/null
    sudo npm link &>/dev/null 2>&1 || npm link &>/dev/null 2>&1
    ok "Print Agent instalado a partir do diretório local."
else
    # Instalação via npm
    npm install -g @operacaofacil/print-agent-linux &>/dev/null
    ok "Print Agent instalado via npm."
fi

# Ajusta o caminho do Chromium no config se necessário
if [ -n "$CHROM_PATH" ] && [ "$CHROM_PATH" != "/usr/bin/chromium-browser" ]; then
    CONFIG_FILE="$(npm root -g 2>/dev/null)/@operacaofacil/print-agent-linux/src/config.js"
    if [ -f "$CONFIG_FILE" ]; then
        sed -i "s|/usr/bin/chromium-browser|$CHROM_PATH|g" "$CONFIG_FILE"
        ok "Caminho do Chromium atualizado em config.js"
    fi
fi

# ── Segurança SSH ─────────────────────────────────────────────────────────────

echo ""
SSH_CONFIG="/etc/ssh/sshd_config"
if [ -f "$SSH_CONFIG" ]; then
    if grep -qiE "^\s*PasswordAuthentication\s+yes" "$SSH_CONFIG" || \
       ! grep -qiE "^\s*PasswordAuthentication\s+no" "$SSH_CONFIG"; then
        warn "Segurança SSH: login por senha está habilitado neste servidor."
        warn "Recomendamos desabilitar para proteger contra invasões:"
        echo "     → Edite $SSH_CONFIG"
        echo "     → Defina: PasswordAuthentication no"
        echo "     → Reinicie: sudo systemctl restart sshd"
    fi
fi

# ── Próximos passos ───────────────────────────────────────────────────────────

echo ""
echo -e "  ${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "  ${BOLD}║     Instalação concluída!               ║${RESET}"
echo -e "  ${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""
echo "  Próximos passos:"
echo ""
echo "  1. Autenticar:"
echo "     print-agent login"
echo ""
echo "  2. Instalar como serviço (inicia automaticamente no boot):"
echo "     print-agent install"
echo ""
echo "  3. Verificar status:"
echo "     print-agent status"
echo ""
