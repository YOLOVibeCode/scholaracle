# Docker Infrastructure Setup Guide

Complete Docker Compose infrastructure with BuildKit, MongoDB, MailHog, and all required services for Scholaracle.

**⚠️ PORT POLICY: All ports are FIXED in the 28XX series and MUST NOT be changed.**
- **2800**: Web App (fixed)
- **2801**: API Server (fixed)
- **2802**: MongoDB (fixed)
- **2803**: MailHog SMTP (fixed)
- **2804**: MailHog UI (fixed)

These ports are standardized and changing them will break configurations, tests, and documentation.

---

## 🚀 Quick Start

### Prerequisites

- **Docker** with BuildKit support (Docker Desktop 4.0+ or Docker Engine 20.10+)
- **Docker Compose** v2.0+
- **Make** (optional, for convenience commands)

### Start Everything

```bash
# Using Make (recommended)
make up

# Or using Docker Compose directly
DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker-compose up -d
```

### Check Health

```bash
make health
```

---

## 📦 Services Included

### 1. **MongoDB** (Port 27017)
- Database for the application
- Persistent volumes for data
- Health checks enabled

### 2. **MailHog** (Ports 1025, 8025)
- SMTP server on port 1025 (for email testing)
- Web UI on port 8025 (view emails)
- Perfect for E2E testing email functionality

### 3. **API Server** (Port 3002)
- Express.js API server
- Auto-rebuilds on code changes (development mode)
- Connects to MongoDB and MailHog

### 4. **Web Application** (Port 3000)
- Next.js frontend
- Hot reload enabled (development mode)
- Connects to API server

---

## 🛠️ Development Workflow

### Start Services

```bash
make up
```

This will:
1. Build images using BuildKit (faster builds)
2. Start MongoDB
3. Start MailHog
4. Start API server
5. Start Web app

### View Logs

```bash
# All services
make logs

# Specific service
make logs-api
make logs-web
make logs-mongo
make logs-mail
```

### Stop Services

```bash
make down
```

### Restart Services

```bash
make restart
```

---

## 🧪 Testing Setup

### E2E Test Environment

```bash
# Start test services (MongoDB + MailHog + API only)
make test-up

# Run E2E tests
make test-e2e

# Or manually
cd packages/e2e
API_BASE_URL=http://localhost:3002 BASE_URL=http://localhost:3000 \
pnpm exec playwright test

# Stop test services
make test-down
```

### Seed Database

```bash
make seed
```

---

## 📧 MailHog Usage

### View Emails

Open http://localhost:2804 in your browser to see all emails sent by the application.

### SMTP Configuration

The API server is automatically configured to use MailHog:
- **Host:** `mailhog` (internal) or `localhost` (external)
- **Port:** `2803` (external) or `1025` (internal container)
- **No authentication required**

### Testing Email in E2E Tests

Emails sent during tests will appear in MailHog UI at http://localhost:2804. You can:
1. Check email content
2. Verify email recipients
3. Test email links
4. View email HTML/text versions

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```bash
# JWT Secret (required)
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# SendGrid (optional - uses MailHog if not set)
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@scholaracle.local
SENDGRID_FROM_NAME=Scholaracle

# Twilio (optional)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

# Firebase (optional)
FIREBASE_PROJECT_ID=
SKIP_FIREBASE=true
```

### Override Configuration

Copy `docker-compose.override.yml.example` to `docker-compose.override.yml` and customize:

```bash
cp docker-compose.override.yml.example docker-compose.override.yml
```

This file is automatically loaded by Docker Compose and allows you to override settings without modifying the main file.

---

## 🏗️ BuildKit Features

### Faster Builds

BuildKit is enabled by default, providing:
- **Parallel builds** - Multiple stages build simultaneously
- **Better caching** - More efficient layer caching
- **Build secrets** - Secure secret handling
- **Multi-platform** - Build for different architectures

### Build Commands

```bash
# Build all images
make build

# Build specific service
docker-compose build api
docker-compose build web
```

---

## 📊 Service URLs

**⚠️ These URLs use FIXED ports that MUST NOT be changed.**

| Service | URL | Description |
|---------|-----|-------------|
| **Web App** | http://localhost:2800 | Next.js frontend (FIXED PORT) |
| **API Server** | http://localhost:2801 | Express.js API (FIXED PORT) |
| **API Health** | http://localhost:2801/api/health | Health check endpoint |
| **MongoDB** | mongodb://localhost:2802 | Database connection (FIXED PORT) |
| **MailHog SMTP** | localhost:2803 | SMTP server (FIXED PORT) |
| **MailHog UI** | http://localhost:2804 | Email testing interface (FIXED PORT) |

**Note:** All port numbers are standardized and must remain unchanged. Modifying these ports will break the entire infrastructure setup.

---

## 🔍 Troubleshooting

### Services Won't Start

```bash
# Check logs
make logs

# Check health
make health

# Restart services
make restart
```

### MongoDB Connection Issues

```bash
# Check if MongoDB is running
docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')"

# Connect from host (using external port)
mongosh mongodb://localhost:2802/scholaracle

# Check MongoDB logs
make logs-mongo
```

### API Server Issues

```bash
# Check API logs
make logs-api

# Check API health
curl http://localhost:2801/api/health
```

### Port Conflicts

**⚠️ IMPORTANT: DO NOT change the port numbers. These are FIXED.**

If ports in the 28XX series are already in use, you must stop the conflicting service:

1. **Find and stop conflicting services:**
   ```bash
   # Find process using port
   lsof -i :2800  # Web
   lsof -i :2801  # API
   lsof -i :2802  # MongoDB
   lsof -i :2803  # MailHog SMTP
   lsof -i :2804  # MailHog UI
   
   # Kill process
   kill -9 <PID>
   ```

2. **DO NOT change ports in docker-compose.yml** - These ports are standardized and must remain:
   - **2800** for Web App
   - **2801** for API Server
   - **2802** for MongoDB
   - **2803** for MailHog SMTP
   - **2804** for MailHog UI

Changing these ports will break E2E tests, CI/CD pipelines, and all documentation references.

### Clean Start

```bash
# Remove all containers and volumes
make clean

# Start fresh
make up
```

---

## 🧹 Cleanup

### Remove Everything

```bash
make clean
```

This removes:
- All containers
- All volumes (including MongoDB data)
- All networks

**⚠️ Warning:** This will delete all data!

### Remove Only Containers

```bash
docker-compose down
```

### Remove Containers and Volumes

```bash
docker-compose down -v
```

---

## 📝 Makefile Commands

| Command | Description |
|---------|-------------|
| `make up` | Start all services |
| `make down` | Stop all services |
| `make restart` | Restart all services |
| `make logs` | Show all logs |
| `make logs-api` | Show API logs |
| `make logs-web` | Show web logs |
| `make logs-mongo` | Show MongoDB logs |
| `make logs-mail` | Show MailHog logs |
| `make test-up` | Start test services |
| `make test-down` | Stop test services |
| `make test-e2e` | Run E2E tests |
| `make seed` | Seed database |
| `make health` | Check service health |
| `make build` | Build all images |
| `make clean` | Remove everything |

---

## 🎯 E2E Testing Workflow

### Complete Test Setup

```bash
# 1. Start test infrastructure
make test-up

# 2. Wait for services to be healthy
make health

# 3. Seed database
make seed

# 4. Run E2E tests
cd packages/e2e
API_BASE_URL=http://localhost:2801 BASE_URL=http://localhost:2800 \
pnpm exec playwright test

# 5. Cleanup
make test-down
```

### Or Use the All-in-One Command

```bash
make test-all
```

This will:
1. Start test services
2. Seed database
3. Run all E2E tests
4. Clean up

---

## 🔐 Security Notes

### Development vs Production

- **Development:** Uses MailHog for email (no real emails sent)
- **Production:** Configure SendGrid API key in `.env`
- **JWT Secret:** Change default in production
- **MongoDB:** No authentication in dev (add auth in production)

### Best Practices

1. **Never commit `.env` files**
2. **Use strong JWT secrets in production**
3. **Enable MongoDB authentication in production**
4. **Use Docker secrets for sensitive data**
5. **Regularly update base images**

---

## 📚 Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [BuildKit Documentation](https://docs.docker.com/build/buildkit/)
- [MailHog Documentation](https://github.com/mailhog/MailHog)
- [MongoDB Docker Image](https://hub.docker.com/_/mongo)

---

## ✅ Verification Checklist

After setup, verify:

- [ ] Web app loads (http://localhost:2800)
- [ ] API server healthy (http://localhost:2801/api/health)
- [ ] MongoDB is running (`make health` shows ✅)
- [ ] MailHog UI accessible (http://localhost:2804)
- [ ] Database can be seeded (`make seed`)
- [ ] E2E tests can run (`make test-e2e`)

---

**Status:** ✅ **Ready for Development & Testing!**
