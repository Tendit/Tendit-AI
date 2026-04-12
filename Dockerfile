FROM node:20-slim

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --production=false

# Copy all source files
COPY . .

# Build the application
RUN npm run build

# Environment
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Start the server
CMD ["node", "dist/index.cjs"]
