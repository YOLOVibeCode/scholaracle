#!/bin/bash

# Scholaracle E2E Test Execution Script
# Runs all tests from Layer 0 (bottom) to Layer 6 (top)
#
# ⚠️ PORT POLICY: Uses FIXED ports (2800-2804). DO NOT change these ports.

set -e

echo "🚀 Scholaracle E2E Test Suite - Full Execution"
echo "================================================"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
# ⚠️ PORT POLICY: These ports are FIXED and MUST NOT be changed
API_PORT=2801  # FIXED - DO NOT CHANGE
WEB_PORT=2800  # FIXED - DO NOT CHANGE
MONGODB_PORT=2802  # FIXED - DO NOT CHANGE
MONGODB_URI="mongodb://localhost:${MONGODB_PORT}/scholaracle"
API_URL="http://localhost:${API_PORT}"
WEB_URL="http://localhost:${WEB_PORT}"

# Check MongoDB
echo -e "${YELLOW}📊 Checking MongoDB...${NC}"
if ! nc -z localhost ${MONGODB_PORT} 2>/dev/null; then
  echo -e "${RED}❌ MongoDB not running on port ${MONGODB_PORT} (FIXED PORT)${NC}"
  echo "   Start with: docker run -d -p ${MONGODB_PORT}:27017 --name mongodb mongo:7"
  echo "   Or: brew services start mongodb-community"
  exit 1
fi
echo -e "${GREEN}✅ MongoDB running${NC}"

# Check if API server is running
echo -e "${YELLOW}🔍 Checking API server...${NC}"
if ! curl -s "${API_URL}/api/health" > /dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  API server not running. Starting...${NC}"
  cd "$(dirname "$0")"
  MONGODB_URI="${MONGODB_URI}" \
  PORT=${API_PORT} \
  NODE_ENV=development \
  pnpm --filter @scholaracle/api start > /tmp/scholaracle-api.log 2>&1 &
  API_PID=$!
  echo "   API server PID: $API_PID"
  sleep 5
  
  # Verify API started
  if ! curl -s "${API_URL}/api/health" > /dev/null 2>&1; then
    echo -e "${RED}❌ API server failed to start${NC}"
    cat /tmp/scholaracle-api.log | tail -20
    exit 1
  fi
  echo -e "${GREEN}✅ API server started${NC}"
else
  echo -e "${GREEN}✅ API server already running${NC}"
  API_PID=""
fi

# Seed database
echo -e "${YELLOW}🌱 Seeding database...${NC}"
SEED_RESULT=$(curl -s -X POST "${API_URL}/api/seed?force=true")
if echo "$SEED_RESULT" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Database seeded successfully${NC}"
else
  echo -e "${YELLOW}⚠️  Seed may have issues:${NC}"
  echo "$SEED_RESULT" | head -5
fi

# Change to e2e directory
cd "$(dirname "$0")/packages/e2e"

# Test results
PASSED=0
FAILED=0
TOTAL=0

# Function to run a test layer
run_layer() {
  local layer_name=$1
  local test_file=$2
  local layer_num=$3
  
  echo ""
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}Layer ${layer_num}: ${layer_name}${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  
  API_BASE_URL="${API_URL}" \
  BASE_URL="${WEB_URL}" \
  pnpm exec playwright test "${test_file}" 2>&1 | tee /tmp/test-layer-${layer_num}.log
  
  local exit_code=${PIPESTATUS[0]}
  
  if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}✅ Layer ${layer_num} PASSED${NC}"
    ((PASSED++))
  else
    echo -e "${RED}❌ Layer ${layer_num} FAILED${NC}"
    ((FAILED++))
    # In fail-fast mode, stop here
    if [ $layer_num -eq 0 ]; then
      echo -e "${RED}🚨 CRITICAL LAYER FAILED - Stopping all tests${NC}"
      return 1
    fi
  fi
  
  return 0
}

# Run tests layer by layer
echo ""
echo -e "${YELLOW}🧪 Starting test execution...${NC}"

# Layer 0: Critical
if ! run_layer "Critical Infrastructure" "tests/00-critical.spec.ts" 0; then
  echo -e "${RED}❌ Critical tests failed - aborting${NC}"
  [ -n "$API_PID" ] && kill $API_PID 2>/dev/null || true
  exit 1
fi

# Layer 1: Auth
if ! run_layer "Authentication" "tests/01-auth.spec.ts" 1; then
  echo -e "${YELLOW}⚠️  Auth layer failed - skipping remaining layers${NC}"
  [ -n "$API_PID" ] && kill $API_PID 2>/dev/null || true
  exit 1
fi

# Layer 2: Dashboard
if ! run_layer "Dashboard Rendering" "tests/02-dashboard-*.spec.ts" 2; then
  echo -e "${YELLOW}⚠️  Dashboard layer failed - skipping remaining layers${NC}"
  [ -n "$API_PID" ] && kill $API_PID 2>/dev/null || true
  exit 1
fi

# Layer 3: Navigation
if ! run_layer "Navigation" "tests/03-navigation-*.spec.ts" 3; then
  echo -e "${YELLOW}⚠️  Navigation layer failed - skipping remaining layers${NC}"
  [ -n "$API_PID" ] && kill $API_PID 2>/dev/null || true
  exit 1
fi

# Layer 4: Feature
if ! run_layer "Feature CRUD" "tests/04-feature-*.spec.ts" 4; then
  echo -e "${YELLOW}⚠️  Feature layer failed - skipping remaining layers${NC}"
  [ -n "$API_PID" ] && kill $API_PID 2>/dev/null || true
  exit 1
fi

# Layer 5: Integration
if ! run_layer "Integration Workflows" "tests/05-integration.spec.ts" 5; then
  echo -e "${YELLOW}⚠️  Integration layer failed - skipping remaining layers${NC}"
  [ -n "$API_PID" ] && kill $API_PID 2>/dev/null || true
  exit 1
fi

# Layer 6: Error
run_layer "Error Handling" "tests/06-error.spec.ts" 6

# Cleanup
if [ -n "$API_PID" ]; then
  echo ""
  echo -e "${YELLOW}🧹 Cleaning up...${NC}"
  kill $API_PID 2>/dev/null || true
fi

# Summary
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}📊 Test Execution Summary${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Passed: ${PASSED} layers${NC}"
echo -e "${RED}❌ Failed: ${FAILED} layers${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 All test layers passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some test layers failed${NC}"
  exit 1
fi
