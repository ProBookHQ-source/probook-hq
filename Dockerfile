FROM node:20

WORKDIR /app

# ── Backend ───────────────────────────────────────────────────
# Only copy package.json (no lockfile) so npm resolves fresh
COPY backend/package.json ./backend/
RUN cd backend && npm install --omit=dev

# ── Frontend ──────────────────────────────────────────────────
# No lockfile = npm picks correct Linux binaries for rollup etc.
# --include=dev  → installs vite, tailwind, etc. (devDependencies)
# --include=optional → installs @rollup/rollup-linux-x64-gnu etc.
COPY frontend/package.json ./frontend/
RUN cd frontend && npm install --include=dev --include=optional

# Copy source and build
# Call bin/vite.js directly — bypasses the broken .bin/vite wrapper
COPY frontend/ ./frontend/
RUN cd frontend && node node_modules/vite/bin/vite.js build

# ── Backend source ────────────────────────────────────────────
COPY backend/ ./backend/

EXPOSE 4000
CMD ["node", "backend/server.js"]
