FROM node:18-slim

# Install chromium
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Set workdir
WORKDIR /app

# Copy files
COPY package*.json ./
RUN npm install

COPY . .

# Start bot
CMD ["npm", "start"]
