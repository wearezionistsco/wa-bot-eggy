FROM node:18-bullseye-slim

# Install Chromium & deps
RUN apt-get update && apt-get install -y \
    chromium-browser \
    chromium-sandbox \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set path Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
