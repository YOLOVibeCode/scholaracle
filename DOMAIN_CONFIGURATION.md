# Domain Configuration

## Official Domain

**Primary Domain**: `scholarmancy.com`

All production URLs, documentation, and configuration should use `scholarmancy.com`.

## Production URLs

- **Web Application**: https://scholarmancy.com
- **API**: https://api.scholarmancy.com
- **Documentation**: https://scholarmancy.com (homepage with links)

## Email Configuration

### SendGrid Configuration
```bash
SENDGRID_FROM_EMAIL=notifications@scholarmancy.com
SENDGRID_FROM_NAME=Scholaracle
SENDGRID_REPLY_TO=rvegajr@yolovibecodebootcamp.com
```

### Verified Sender
The verified sender email for production is:
- `rvegajr@yolovibecodebootcamp.com`

All notification emails should be sent from this verified address to avoid SendGrid "Forbidden" errors.

## Environment Variables

### Production (Railway)

```bash
# Base URLs
BASE_URL=https://scholarmancy.com
API_BASE_URL=https://api.scholarmancy.com
WEB_URL=https://scholarmancy.com
NEXT_PUBLIC_APP_URL=https://scholarmancy.com

# Email
SENDGRID_API_KEY=<secret>
SENDGRID_FROM_EMAIL=rvegajr@yolovibecodebootcamp.com
SENDGRID_FROM_NAME=Scholaracle
SENDGRID_REPLY_TO=rvegajr@yolovibecodebootcamp.com
```

### Development

For local development, use localhost URLs:
```bash
BASE_URL=http://localhost:2800
API_BASE_URL=http://localhost:2801
WEB_URL=http://localhost:2800
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Demo Account

- **Email**: `demo@scholarmancy.com`
- **Password**: `DemoPass123!`

## Documentation Updates

All documentation has been updated to reference `scholarmancy.com` instead of the old domain. Files updated include:

- ✅ `docs/parental-access-control.md`
- ✅ `docs/full-ux-e2e-with-mailpit.md`
- ✅ `DEPLOYMENT_SUCCESS.md`
- ✅ `DEPLOYMENT_PLAN.md`
- ✅ `packages/api/src/server.ts`
- ✅ `packages/workers/src/worker.ts`
- ✅ `packages/workers/src/scripts/trigger-sync-and-digest.ts`
- ✅ `packages/workers/src/scripts/send-digest-now.ts`
- ✅ `packages/agents/src/worker/SyncWorker/SyncWorker.ts`
- ✅ `packages/connector/src/canvas/canvas-adapter.test.ts`

## Notes

- Demo/test data files (`packages/api/src/routes/seed/demo-data.ts`) intentionally use `demo@scholaracle.com` for internal test accounts and should not be changed.
- The branded name "Scholaracle" remains the product name in all user-facing content and email templates.
- Domain is `scholarmancy.com`, brand is "Scholaracle".
