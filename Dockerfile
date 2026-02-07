FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy source
COPY src/ src/
COPY tsconfig.json ./

# The bot runs via tsx (TypeScript executor)
CMD ["npx", "tsx", "src/bot.ts"]
