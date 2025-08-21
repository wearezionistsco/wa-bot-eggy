# Gunakan Node.js versi LTS
FROM node:18

# Tentukan working directory
WORKDIR /app

# Copy package.json & package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy semua file project
COPY . .

# Expose port (Railway akan otomatis override dengan PORT env)
EXPOSE 3000

# Jalankan aplikasi
CMD ["node", "index.js"]
