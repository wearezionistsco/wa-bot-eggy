# whatsapp-bot/Dockerfile
FROM node:18-bullseye

# Install Chromium for puppeteer-core used by whatsapp-web.js
RUN apt-get update && apt-get install -y chromium && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Persist WA session & user db via volumes (Railway toml handles mount)
VOLUME ["/app/.wwebjs_auth", "/app/data"]

# Let whatsapp-web.js know where Chromium is
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

CMD ["npm", "start"]
