#!/bin/bash
# Docker Verification Script for agent-tools
# This script verifies that Docker containerization works correctly

set -e

echo "=== Agent Tools Docker Verification ==="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Error: Docker is not running"
  echo "Please start Docker Desktop and try again"
  exit 1
fi

echo "✅ Docker is running"
echo ""

# Build the Docker image
echo "Building Docker image..."
docker build -t agent-tools:test .

if [ $? -eq 0 ]; then
  echo "✅ Docker image built successfully"
else
  echo "❌ Docker build failed"
  exit 1
fi
echo ""

# Check image size
IMAGE_SIZE=$(docker images agent-tools:test --format "{{.Size}}")
echo "📦 Image size: $IMAGE_SIZE"
echo ""

# Create data directory if it doesn't exist
mkdir -p data

# Run the container in detached mode
echo "Starting container..."
docker run -d \
  -p 3001:3000 \
  -e NODE_ENV=production \
  -e API_KEY=test-key-12345 \
  -e LOG_LEVEL=info \
  -v "$(pwd)/data:/app/data" \
  --name agent-tools-test \
  agent-tools:test

if [ $? -eq 0 ]; then
  echo "✅ Container started successfully"
else
  echo "❌ Container failed to start"
  exit 1
fi
echo ""

# Wait for container to be healthy
echo "Waiting for health check..."
for i in {1..10}; do
  HEALTH=$(docker inspect --format='{{.State.Health.Status}}' agent-tools-test 2>/dev/null || echo "starting")
  echo "  Health status: $HEALTH (attempt $i/10)"

  if [ "$HEALTH" = "healthy" ]; then
    echo "✅ Container is healthy"
    break
  fi

  if [ "$i" -eq 10 ]; then
    echo "❌ Container failed to become healthy"
    docker logs agent-tools-test
    docker stop agent-tools-test
    docker rm agent-tools-test
    exit 1
  fi

  sleep 3
done
echo ""

# Test the health endpoint
echo "Testing /health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:3001/health)
if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
  echo "✅ Health check endpoint working"
  echo "   Response: $HEALTH_RESPONSE"
else
  echo "❌ Health check endpoint failed"
  echo "   Response: $HEALTH_RESPONSE"
  docker logs agent-tools-test
  docker stop agent-tools-test
  docker rm agent-tools-test
  exit 1
fi
echo ""

# Test authentication
echo "Testing authentication..."
AUTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/todos)
if [ "$AUTH_RESPONSE" = "401" ]; then
  echo "✅ Authentication working (401 without token)"
else
  echo "❌ Authentication test failed (expected 401, got $AUTH_RESPONSE)"
fi
echo ""

# Test with valid token
echo "Testing with valid API key..."
API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer test-key-12345" http://localhost:3001/todos)
if [ "$API_RESPONSE" = "200" ]; then
  echo "✅ API working with valid token"
else
  echo "❌ API test failed (expected 200, got $API_RESPONSE)"
fi
echo ""

# Check logs
echo "Recent container logs:"
docker logs --tail 10 agent-tools-test
echo ""

# Cleanup
echo "Cleaning up..."
docker stop agent-tools-test
docker rm agent-tools-test

echo ""
echo "=== All verification checks passed! ==="
echo ""
echo "Next steps:"
echo "1. Test with docker-compose: docker-compose up -d"
echo "2. Push image to registry: docker tag agent-tools:test your-registry/agent-tools:latest"
echo "3. Deploy to production environment"
