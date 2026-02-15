#!/bin/bash

# Discord Terminator - Docker Build and Test Script
# This script builds the Docker image and runs basic tests

set -e

echo "🐳 Discord Terminator - Docker Build & Test"
echo "==========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed!"
    echo "   Please install Docker from: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "❌ Docker daemon is not running!"
    echo "   Please start Docker Desktop or run: sudo systemctl start docker"
    exit 1
fi

echo "✅ Docker is installed and running"
echo ""

# Build the Docker image
echo "🔨 Building Docker image..."
echo "   This may take 3-5 minutes on first build..."
echo ""

docker build -t discord-terminator:test . || {
    echo ""
    echo "❌ Docker build failed!"
    echo "   Check the error messages above for details."
    exit 1
}

echo ""
echo "✅ Docker image built successfully!"
echo ""

# Test the image
echo "🧪 Testing the Docker image..."
echo ""

# Start container in background
docker run -d --name discord-terminator-test -p 8001:8000 discord-terminator:test

# Wait for container to start
echo "   Waiting for container to start..."
sleep 5

# Check if container is running
if ! docker ps | grep -q discord-terminator-test; then
    echo "❌ Container failed to start!"
    echo "   Logs:"
    docker logs discord-terminator-test
    docker rm -f discord-terminator-test 2>/dev/null
    exit 1
fi

# Test health endpoint
echo "   Testing health endpoint..."
if curl -f http://localhost:8001/health &> /dev/null; then
    echo "✅ Health check passed!"
else
    echo "❌ Health check failed!"
    docker logs discord-terminator-test
    docker rm -f discord-terminator-test 2>/dev/null
    exit 1
fi

# Test API endpoint
echo "   Testing API endpoint..."
if curl -f http://localhost:8001/api/health &> /dev/null; then
    echo "✅ API check passed!"
else
    echo "❌ API check failed!"
    docker logs discord-terminator-test
    docker rm -f discord-terminator-test 2>/dev/null
    exit 1
fi

# Cleanup
echo ""
echo "🧹 Cleaning up test container..."
docker stop discord-terminator-test &> /dev/null
docker rm discord-terminator-test &> /dev/null

echo ""
echo "=========================================="
echo "✅ All tests passed!"
echo ""
echo "Your Docker image is ready to use:"
echo "   docker run -d -p 8000:8000 discord-terminator:test"
echo ""
echo "Or use docker-compose:"
echo "   docker-compose up -d"
echo ""
echo "Then open: http://localhost:8000"
echo "=========================================="
