FROM node:18-bullseye

WORKDIR /app

# install chromium untuk whatsapp-web.js (puppeteer-core)
RUN apt-get update && apt-get install -y chromium && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# beri tahu path chromium ke puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

CMD ["npm", "start"]
