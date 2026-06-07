# Fortis FM Site Inspector - production image for Railway.
# Node 20 LTS slim base, plus the system libraries Chromium needs so that
# puppeteer (installed via npm) can launch its bundled browser.
FROM node:20-slim

WORKDIR /app

# System packages required by Chromium. The puppeteer docs list these as the
# minimum needed on Debian-based images.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    wget \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

# Install ALL deps (including dev) so we can build the bundle.
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build.
COPY . .
RUN npm run build

# Drop dev dependencies after the build to slim the runtime image. Puppeteer's
# bundled Chromium is in node_modules so we keep that.
RUN npm prune --omit=dev

# Persistent data lives on a Railway volume mounted at /data.
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=5000

EXPOSE 5000

CMD ["node", "dist/index.cjs"]
