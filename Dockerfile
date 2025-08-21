FROM node:18

# Set working dir
WORKDIR /app

# Install Chromium dan dependencies yang dibutuhkan Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Copy dependencies
COPY package*.json ./
RUN npm install --production

# Copy source
COPY . .

# Puppeteer pakai Chromium yang sudah diinstall
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Jalankan app
CMD ["npm", "start"]
