# Multi-stage build for Discord Terminator
# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY src/frontend/package*.json ./
RUN npm install

# Copy frontend source
COPY src/frontend/ ./

# Build frontend for production
RUN npm run build

# Stage 2: Node.js Backend + Serve Frontend
FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy backend package files
COPY src/backend/package*.json ./src/backend/
WORKDIR /app/src/backend
RUN npm install --production

WORKDIR /app

# Copy backend code
COPY src/backend/ ./src/backend/

# Copy built frontend from previous stage
COPY --from=frontend-builder /app/frontend/dist /app/src/backend/frontend_dist

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start the application
CMD ["node", "src/backend/server.js"]
