# Manual Digest Trigger - Complete

## ✅ Implementation Complete

The manual digest trigger endpoint has been **successfully implemented and deployed**.

### Endpoint Details

```
POST https://api.scholarmancy.com/api/students/:id/send-digest
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <your-auth-token>
```

**Body:**
```json
{
  "recipients": "all"  // or ["robin.sample@yopmail.com", "jamie.sample@yopmail.com"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Digest queued for 2 recipient(s)",
  "recipients": [
    { "email": "robin.sample@yopmail.com", "name": "Robin Sample", "role": "owner" },
    { "email": "jamie.sample@yopmail.com", "name": "Jamie Sample", "role": "parent" }
  ],
  "jobId": "..."
}
```

---

## How to Use

### Option 1: Via curl (with auth token)

```bash
# Get your auth token first
TOKEN="your-jwt-token-here"

# Get Avery's student ID
STUDENT_ID="avery-student-id-here"

# Trigger digest
curl -X POST https://api.scholarmancy.com/api/students/$STUDENT_ID/send-digest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"recipients": "all"}'
```

### Option 2: Via Web Dashboard (if implemented)

Navigate to student profile → Settings → Send Digest

### Option 3: Via Railway CLI (requires database access)

```bash
cd /path/to/scholaracle
railway shell --service api
# Then run Node.js script to call endpoint
```

---

## What Happens When You Trigger

1. **Permission Check**: Only account owner or admin can trigger
2. **Recipient Resolution**: Gets all opted-in recipients (owner + shared parents)
3. **Notification Created**: Creates alert with grade precedence message
4. **Digest Queue**: Adds items to `email_digest_pending` collection
5. **Flush Job**: Creates immediate delivery job in `jobs` collection
6. **Worker Processes**: Email digest worker picks up job and sends emails

---

## Digest Email Content

**Subject**: "Daily Digest for Avery Sample"

**Content**:
- 📊 Grade summary bar with current grades
- 🔔 Grade System Updated notification
- Message: "Your student's grades now show official Skyward (SIS) grades as the primary grades. Canvas grades remain visible for reference."
- 🔗 Link to dashboard

**Recipients for Avery**:
- ✉️ Robin Sample <robin.sample@yopmail.com>
- ✉️ Jamie Sample <jamie.sample@yopmail.com>

---

## To Trigger Right Now

You need:
1. **Student ID**: Get from database or API call to `/api/students`
2. **Auth Token**: Get from login or use admin token

**Quick method** (if you have database access):

```javascript
// In MongoDB shell or Node.js with MongoDB driver
const db = ... // your database connection

// Get Avery's ID
const avery = await db.collection('students').findOne({ name: 'Avery Sample' });
console.log('Student ID:', avery._id.toString());

// Then use curl with that ID
```

---

## Status

✅ **Deployed**: Main branch pushed, Railway auto-deployed  
✅ **Endpoint Live**: https://api.scholarmancy.com/api/students/:id/send-digest  
✅ **Permission Checks**: Owner/admin only  
✅ **Recipient Filtering**: Respects opt-in preferences  
✅ **Immediate Delivery**: Creates flush job for instant send  

---

## Next Steps

To actually send the digest to Robin and Jamie:

1. Get your authentication token (login to the app)
2. Get Avery's student ID (call `/api/students` with token)
3. Call the endpoint with those values
4. Check Railway logs for worker processing: `railway logs --service workers -f`
5. Verify email delivery (check yopmail.com inboxes)

Would you like me to help you get the student ID and token to trigger it now?
