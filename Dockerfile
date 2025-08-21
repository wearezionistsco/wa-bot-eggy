# Gunakan Node.js
FROM node:18

# Set working dir
WORKDIR /app

# Copy package.json & install
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy semua file
COPY . .

# Jalankan bot
CMD ["npm", "start"]
