FROM node:18-slim

# Install dependencies yang diperlukan untuk Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libnss3 \
    libxshmfence1 \
    ca-certificates \
    wget \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Set env supaya Puppeteer pakai Chromium dari sistem
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Direktori kerja
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy semua source code
COPY . .

# Expose port (jika pakai Express untuk API / monitoring)
EXPOSE 3000

# Jalankan aplikasi
CMD ["node", "index.js"]
