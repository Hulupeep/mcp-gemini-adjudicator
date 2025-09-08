# Multi-stage build for Gemini Consensus application
# Stage 1: Build stage
FROM node:20-alpine AS builder

# Install security updates and build dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init git python3 make g++

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Production stage
FROM node:20-alpine AS production

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S gemini -u 1001 -G nodejs

# Create app directory
WORKDIR /usr/src/app

# Copy production node_modules from builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy application code
COPY --chown=gemini:nodejs . .

# Remove unnecessary files for production
RUN rm -rf tests/ docs/ examples/ *.md LICENSE docker/ .git* && \
    chmod -R 755 /usr/src/app

# Security: Switch to non-root user
USER gemini

# Expose port
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "const http = require('http'); \
    const options = { host: 'localhost', port: 3000, path: '/health', timeout: 2000 }; \
    const req = http.request(options, (res) => { \
        if (res.statusCode === 200) process.exit(0); \
        else process.exit(1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.end();"

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "src/server.js"]

# Labels for metadata
LABEL maintainer="YOUR_EMAIL"
LABEL version="1.0.0"
LABEL description="Gemini Consensus - Advanced consensus mechanism implementation"
LABEL org.opencontainers.image.title="Gemini Consensus"
LABEL org.opencontainers.image.description="Advanced consensus mechanism with Byzantine fault tolerance"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="YOUR_NAME"