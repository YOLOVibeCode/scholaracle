# Complete E2E Test Execution Guide

**⚠️ PORT POLICY: All services use FIXED ports in the 28XX series. DO NOT change these ports.**

**Status:** ✅ Layer 0 Passing | ⚠️ Setup Required for Full Suite

---

## 🎯 Current Status

### ✅ Layer 0: Critical - **ALL PASSING** (3/3)
```
✓ CRIT-001: App loads without crash
✓ CRIT-002: Login page accessible  
✓ CRIT-003: API health check
```

### ⚠️ Layer 1+: Blocked by MongoDB Connection

**Issue:** MongoDB not running - API server can't connect to database

---

## 🚀 Complete Setup & Execution

### Prerequisites

1. **MongoDB Running** (Required)
   ```bash
   # Option 1: Docker MongoDB
   docker run -d -p 27017:27017 --name mongodb mongo:7
   
   # Option 2: Local MongoDB
   brew services start mongodb-community
   # or
   mongod --dbpath /path/to/data
   ```

2. **API Server Running** (Port 3002)
   ```bash
   cd scholaracle
   MONGODB_URI=mongodb://localhost:27017/scholaracle \
   PORT=3002 \
   NODE_ENV=development \
   pnpm --filter @scholaracle/api start
   ```

3. **Web App Running** (Port 3000)
   ```bash
   cd scholaracle
   NEXT_PUBLIC_API_URL=http://localhost:3002/api \
   pnpm --filter @scholaracle/web dev
   ```

4. **Seed Database**
   ```bash
   curl -X POST 'http://localhost:3002/api/seed?force=true'
   ```

---

## 📋 Test Execution (Layer by Layer)

### Layer 0: Critical ✅
```bash
cd packages/e2e
API_BASE_URL=http://localhost:3002 BASE_URL=http://localhost:3000 \
pnpm exec playwright test tests/00-critical.spec.ts
```
**Status:** ✅ **3/3 PASSING**

### Layer 1: Auth (8 tests)
```bash
API_BASE_URL=http://localhost:3002 BASE_URL=http://localhost:3000 \
pnpm exec playwright test tests/01-auth.spec.ts
```
**Status:** ⚠️ **Blocked** - Needs MongoDB + API working

### Layer 2: Dashboard (28 tests)
```bash
API_BASE_URL=http://localhost:3002 BASE_URL=http://localhost:3000 \
pnpm exec playwright test tests/02-dashboard-*.spec.ts
```

### Layer 3: Navigation (30 tests)
```bash
API_BASE_URL=http://localhost:3002 BASE_URL=http://localhost:3000 \
pnpm exec playwright test tests/03-navigation-*.spec.ts
```

### Layer 4: Feature (25 tests)
```bash
API_BASE_URL=http://localhost:3002 BASE_URL=http://localhost:3000 \
pnpm exec playwright test tests/04-feature-*.spec.ts
```

### Layer 5: Integration (5 tests)
```bash
API_BASE_URL=http://localhost:3002 BASE_URL=http://localhost:3000 \
pnpm exec playwright test tests/05-integration.spec.ts
```

### Layer 6: Error (6 tests)
```bash
API_BASE_URL=http://localhost:3002 BASE_URL=http://localhost:3000 \
pnpm exec playwright test tests/06-error.spec.ts
```

### Full Suite (All Layers)
```bash
API_BASE_URL=http://localhost:3002 BASE_URL=http://localhost:3000 \
pnpm exec playwright test
```

---

## 🔧 Quick Start Script

Create `run-tests.sh`:

```bash
#!/bin/bash

set -e

echo "🚀 Starting Scholaracle E2E Test Suite"

# 1. Check MongoDB
echo "📊 Checking MongoDB..."
if ! nc -z localhost 27017 2>/dev/null; then
  echo "❌ MongoDB not running on port 27017"
  echo "   Start with: docker run -d -p 27017:27017 --name mongodb mongo:7"
  exit 1
fi
echo "✅ MongoDB running"

# 2. Start API Server (background)
echo "🚀 Starting API server..."
cd packages/api
MONGODB_URI=mongodb://localhost:27017/scholaracle \
PORT=3002 \
NODE_ENV=development \
pnpm start > /tmp/scholaracle-api.log 2>&1 &
API_PID=$!
sleep 5

# 3. Seed Database
echo "🌱 Seeding database..."
curl -X POST 'http://localhost:3002/api/seed?force=true' || echo "⚠️ Seed failed"

# 4. Run Tests
cd ../e2e
echo "🧪 Running E2E tests..."
API_BASE_URL=http://localhost:3002 \
BASE_URL=http://localhost:3000 \
pnpm exec playwright test

# Cleanup
kill $API_PID 2>/dev/null || true
echo "✅ Tests complete!"
```

---

## 📊 Test Results Summary

| Layer | Tests | Status | Notes |
|-------|-------|--------|-------|
| 0: Critical | 3 | ✅ **PASSING** | All tests pass |
| 1: Auth | 8 | ⚠️ **BLOCKED** | Needs MongoDB |
| 2: Dashboard | 28 | ⚠️ **PENDING** | Depends on Layer 1 |
| 3: Navigation | 30 | ⚠️ **PENDING** | Depends on Layer 2 |
| 4: Feature | 25 | ⚠️ **PENDING** | Depends on Layer 3 |
| 5: Integration | 5 | ⚠️ **PENDING** | Depends on Layer 4 |
| 6: Error | 6 | ⚠️ **PENDING** | Depends on Layer 5 |
| **TOTAL** | **~105** | **3/105** | **2.9% Complete** |

---

## ✅ What's Working

1. ✅ **Firebase Fixed** - Made optional, no longer blocks startup
2. ✅ **API Server** - Starts successfully (when MongoDB available)
3. ✅ **Web App** - Running on port 3000
4. ✅ **Test Infrastructure** - All 105+ tests implemented
5. ✅ **Layer 0 Tests** - All 3 critical tests passing
6. ✅ **Database Seeding** - Endpoint works (when MongoDB available)

---

## ⚠️ What's Needed

1. **MongoDB Running** - Start MongoDB on port 27017
2. **API Server** - Ensure it connects to MongoDB
3. **Test Execution** - Run tests layer by layer

---

## 🎯 Next Steps

1. **Start MongoDB:**
   ```bash
   docker run -d -p 27017:27017 --name mongodb mongo:7
   ```

2. **Start Services:**
   ```bash
   # Terminal 1: API Server
   MONGODB_URI=mongodb://localhost:27017/scholaracle PORT=3002 pnpm --filter @scholaracle/api start
   
   # Terminal 2: Web App (already running)
   # Terminal 3: Run Tests
   ```

3. **Run Full Suite:**
   ```bash
   cd packages/e2e
   API_BASE_URL=http://localhost:3002 BASE_URL=http://localhost:3000 \
   pnpm exec playwright test
   ```

---

**Current Progress:** Layer 0 ✅ Complete | Ready to proceed once MongoDB is running!
