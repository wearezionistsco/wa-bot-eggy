FROM node:18-bullseye-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install Chromium dari Debian repo
RUN apt-get update && apt-get install -y chromium \
    && rm -rf /var/lib/apt/lists/*

# Pastikan executable path
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json ./

# Jangan download Chromium bawaan puppeteer
ENV PUPPETEER_SKIP_DOWNLOAD=true

RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
