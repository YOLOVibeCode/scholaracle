# Port Mapping Reference

**⚠️ IMPORTANT: These port numbers are FIXED and MUST NOT be changed.**

All Scholaracle services use ports in the **28XX series** to keep them grouped together and avoid conflicts. These ports are standardized across all environments (development, testing, production) and must remain consistent.

## Port Policy

**DO NOT CHANGE THESE PORTS.** They are:
- Standardized across all environments
- Referenced in multiple configuration files
- Used by CI/CD pipelines
- Documented in multiple places
- Expected by E2E tests

Changing these ports will break:
- Docker Compose configurations
- E2E test suite
- CI/CD pipelines
- Documentation references
- Developer workflows

## Port Assignments

| Port | Service | Internal Port | Description |
|------|---------|---------------|-------------|
| **2800** | Web App | 3000 | Next.js frontend |
| **2801** | API Server | 3002 | Express.js API backend |
| **2802** | MongoDB | 27017 | Database server |
| **2803** | MailHog SMTP | 1025 | Email testing SMTP server |
| **2804** | MailHog UI | 8025 | Email testing web interface |

## Connection Strings

### Development (from host machine)
```bash
# Web App
http://localhost:2800

# API
http://localhost:2801
http://localhost:2801/api/health

# MongoDB
mongodb://localhost:2802/scholaracle

# MailHog
http://localhost:2804  # Web UI
localhost:2803         # SMTP
```

### Docker Containers (internal)
```bash
# MongoDB
mongodb://mongodb:27017/scholaracle

# API
http://api:3002

# Web App
http://web:3000

# MailHog
http://mailhog:8025  # Web UI
mailhog:1025         # SMTP
```

## Environment Variables

### For Web App
```bash
NEXT_PUBLIC_API_URL=http://localhost:2801/api  # External
PORT=3000  # Internal (maps to 2800 external)
```

### For API Server
```bash
MONGODB_URI=mongodb://mongodb:27017/scholaracle  # Internal
MONGODB_URI_EXTERNAL=mongodb://localhost:2802/scholaracle  # External
PORT=3002  # Internal (maps to 2801 external)
```

### For E2E Tests
```bash
API_BASE_URL=http://localhost:2801
BASE_URL=http://localhost:2800
```

## Quick Reference

```bash
# Check if ports are in use
lsof -i :2800  # Web
lsof -i :2801  # API
lsof -i :2802  # MongoDB
lsof -i :2803  # MailHog SMTP
lsof -i :2804  # MailHog UI

# Test connections
curl http://localhost:2800              # Web
curl http://localhost:2801/api/health  # API
mongosh mongodb://localhost:2802/scholaracle  # MongoDB
curl http://localhost:2804              # MailHog UI
```

## Benefits

✅ **Grouped together** - All ports in 2800-2804 range  
✅ **Easy to remember** - Sequential numbering  
✅ **Web first** - 2800 for frontend (most accessed)  
✅ **API second** - 2801 for backend API  
✅ **MongoDB third** - 2802 for database  
✅ **No conflicts** - Unlikely to clash with common services  
✅ **Consistent** - Same ports across dev, test, and docs  
