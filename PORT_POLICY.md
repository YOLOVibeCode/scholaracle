# Port Policy - Fixed Port Numbers

**⚠️ CRITICAL: These port numbers are FIXED and MUST NEVER be changed.**

## Standardized Ports

All Scholaracle services use **fixed port numbers** in the **28XX series**. These ports are:

| Port | Service | Status | Notes |
|------|---------|--------|-------|
| **2800** | Web App | 🔒 FIXED | Next.js frontend - DO NOT CHANGE |
| **2801** | API Server | 🔒 FIXED | Express.js API - DO NOT CHANGE |
| **2802** | MongoDB | 🔒 FIXED | Database server - DO NOT CHANGE |
| **2803** | MailHog SMTP | 🔒 FIXED | Email testing SMTP - DO NOT CHANGE |
| **2804** | MailHog UI | 🔒 FIXED | Email testing web UI - DO NOT CHANGE |

## Why These Ports Are Fixed

These ports are standardized because they are:

1. **Referenced in multiple configuration files:**
   - `docker-compose.yml`
   - `docker-compose.test.yml`
   - `playwright.config.ts`
   - `Makefile`
   - E2E test files

2. **Used by automated systems:**
   - CI/CD pipelines
   - E2E test suite
   - Health checks
   - Docker Compose orchestration

3. **Documented across multiple files:**
   - `DOCKER_SETUP.md`
   - `PORT_MAPPING.md`
   - `README.md`
   - Test documentation

4. **Expected by developers:**
   - Local development workflows
   - Testing procedures
   - Debugging guides

## What Happens If You Change These Ports

Changing these ports will break:

- ❌ **Docker Compose** - Services won't connect properly
- ❌ **E2E Tests** - Tests will fail to connect to services
- ❌ **CI/CD Pipelines** - Automated tests will fail
- ❌ **Documentation** - All references become incorrect
- ❌ **Developer Workflows** - Team members will have mismatched configurations
- ❌ **Health Checks** - Monitoring will fail
- ❌ **Service Discovery** - Services won't find each other

## Port Conflict Resolution

**If a port is already in use, DO NOT change the Scholaracle port. Instead:**

1. **Identify the conflicting service:**
   ```bash
   lsof -i :2800  # Find what's using port 2800
   lsof -i :2801  # Find what's using port 2801
   # etc.
   ```

2. **Stop the conflicting service:**
   ```bash
   kill -9 <PID>  # Stop the conflicting process
   ```

3. **Or use a different machine/environment** - Do NOT modify Scholaracle ports.

## Port Usage Guidelines

### ✅ DO:
- Use these exact port numbers
- Reference them in documentation
- Use them in configuration files
- Expect them in all environments

### ❌ DON'T:
- Change port numbers in any configuration file
- Use different ports for "convenience"
- Modify ports to avoid conflicts (fix conflicts instead)
- Document alternative port numbers
- Create port "variants" or "alternatives"

## Verification

To verify ports are correctly configured:

```bash
# Check all fixed ports are available
lsof -i :2800  # Should be empty or Scholaracle Web
lsof -i :2801  # Should be empty or Scholaracle API
lsof -i :2802  # Should be empty or Scholaracle MongoDB
lsof -i :2803  # Should be empty or Scholaracle MailHog SMTP
lsof -i :2804  # Should be empty or Scholaracle MailHog UI

# Test connections
curl http://localhost:2800  # Web App
curl http://localhost:2801/api/health  # API Health
mongosh mongodb://localhost:2802/scholaracle  # MongoDB
curl http://localhost:2804  # MailHog UI
```

## Enforcement

This port policy is enforced by:

1. **Configuration Files** - All Docker Compose files use these ports
2. **Test Suite** - E2E tests expect these exact ports
3. **CI/CD** - Pipelines verify these ports are used
4. **Documentation** - All docs reference these ports
5. **Code Review** - Any port changes will be rejected

## Questions?

If you need to use different ports:
1. **Don't** - Use the standard ports
2. **Fix conflicts** - Stop conflicting services
3. **Ask** - Contact the team lead before making any changes

**Remember: These ports are FIXED. Do not change them.**
