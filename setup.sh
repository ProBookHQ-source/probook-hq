#!/bin/bash
# ═══════════════════════════════════════════════
#  ProBook — One-Command Setup
#  Run this once: bash setup.sh
# ═══════════════════════════════════════════════
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     ProBook Setup — Starting...      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Check Node.js ─────────────────────────────
if ! command -v node &> /dev/null; then
  echo "❌  Node.js not found. Install it from https://nodejs.org (v18 or higher)"
  exit 1
fi
NODE_VER=$(node -v | cut -c2- | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌  Node.js v18+ required. You have $(node -v). Update at https://nodejs.org"
  exit 1
fi
echo -e "${GREEN}✓${NC}  Node.js $(node -v) found"

# ── Install backend dependencies ───────────────
echo ""
echo -e "${BLUE}[1/4]${NC} Installing backend packages..."
npm install --prefix backend --silent
echo -e "${GREEN}✓${NC}  Backend packages installed"

# ── Install frontend dependencies ─────────────
echo ""
echo -e "${BLUE}[2/4]${NC} Installing frontend packages..."
npm install --prefix frontend --silent
echo -e "${GREEN}✓${NC}  Frontend packages installed"

# ── Build the frontend ─────────────────────────
echo ""
echo -e "${BLUE}[3/4]${NC} Building frontend..."
npm run build --prefix frontend --silent
echo -e "${GREEN}✓${NC}  Frontend built"

# ── Create .env if not present ─────────────────
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo -e "${GREEN}✓${NC}  Created .env (from .env.example)"
else
  echo -e "${GREEN}✓${NC}  .env already exists — skipping"
fi

# ── Create admin account ───────────────────────
echo ""
echo -e "${BLUE}[4/4]${NC} Create your admin account"
echo ""
read -p "    Admin name:     " ADMIN_NAME
read -p "    Admin email:    " ADMIN_EMAIL
read -s -p "    Admin password: " ADMIN_PASS
echo ""

# Start server briefly to register, then stop it
node backend/server.js &
SERVER_PID=$!
sleep 2

REGISTER=$(curl -s -X POST http://localhost:4000/api/auth/admin/register \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$ADMIN_NAME\",\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\",\"setupKey\":\"setup-1234\"}")

kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

if echo "$REGISTER" | grep -q '"token"'; then
  echo -e "${GREEN}✓${NC}  Admin account created"
else
  # Account might already exist — that's fine
  echo -e "${YELLOW}⚠${NC}   Admin may already exist — continuing"
fi

# ── Done ───────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Setup Complete! 🎉           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
echo "  Start the app anytime with:"
echo ""
echo -e "    ${YELLOW}npm start${NC}"
echo ""
echo "  Then open: http://localhost:4000"
echo ""
echo "  ─────────────────────────────────────"
echo "  Next steps:"
echo "  1. Open .env and add your email (SMTP) settings"
echo "  2. Log in at http://localhost:4000/login"
echo "  3. Add your contractors in the Admin dashboard"
echo "  4. Embed /get-quote on your website"
echo ""
