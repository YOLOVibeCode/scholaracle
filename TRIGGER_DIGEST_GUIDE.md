# How to Trigger Digest for Ava Lewis

## Quick Reference

**Your Email**: rvegajr@noctusoft.com (Primary Account Owner)

**Other Recipients**:
- rmlewis1976@gmail.com (Robert Lewis - Shared Parent)
- jdenise11@hotmail.com (Jessica Lewis - Shared Parent)
- 29alewis@ldisd.net (Ava Lewis - Student)

---

## Method 1: Via Web Dashboard (Easiest)

1. Login to https://app.scholarmancy.com with your email
2. Navigate to Ava's student profile
3. Click "Send Digest" button
4. Select recipients (or "all")
5. Click "Send Now"

---

## Method 2: Via Command Line (Using Script)

**Step 1: Get Your Credentials**

```bash
# Login to the web app first
# Then get your auth token from browser DevTools:
# 1. Open DevTools (F12)
# 2. Application > Local Storage
# 3. Copy token value
```

**Step 2: Get Student ID**

Option A - From Web URL:
- Navigate to Ava's profile
- URL will be: https://app.scholarmancy.com/students/{STUDENT_ID}
- Copy the ID from URL

Option B - From API:
```bash
curl https://api.scholarmancy.com/api/students \
  -H "Authorization: Bearer YOUR_TOKEN" | jq
```

**Step 3: Run the Script**

```bash
cd /path/to/scholaracle

# Send to just you
./send-digest.sh <STUDENT_ID> <AUTH_TOKEN> rvegajr@noctusoft.com

# Send to all
./send-digest.sh <STUDENT_ID> <AUTH_TOKEN> all
```

---

## Method 3: Direct API Call

```bash
STUDENT_ID="your-student-id"
AUTH_TOKEN="your-auth-token"

# Send to just primary owner (you)
curl -X POST "https://api.scholarmancy.com/api/students/$STUDENT_ID/send-digest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"recipients": ["rvegajr@noctusoft.com"]}'

# Send to all recipients
curl -X POST "https://api.scholarmancy.com/api/students/$STUDENT_ID/send-digest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"recipients": "all"}'
```

---

## What the Digest Contains

**Subject**: "Daily Digest for Ava Lewis"

**Content**:
1. 📊 Grade Summary Bar
   - Algebra 1: 76% (C) - Skyward SIS
   - English 1: 74% (C) - Skyward SIS
   - Science: 91% (A-) - Skyward SIS
   - Other courses...

2. 🔔 Notification
   - Title: "Grade System Updated - Skyward Now Primary"
   - Message: "Your student's grades now show official Skyward (SIS) grades as the primary grades. Canvas grades remain visible for reference."

3. 🔗 Dashboard Link
   - Direct link to Ava's profile

**Tone**: Parent-toned (since you're the primary owner)

---

## Expected Response

**Success Response:**
```json
{
  "success": true,
  "message": "Digest queued for 1 recipient(s)",
  "recipients": [
    {
      "email": "rvegajr@noctusoft.com",
      "name": "Ricky Vega",
      "role": "owner"
    }
  ],
  "jobId": "..."
}
```

**Email Delivery:**
- Emails are queued immediately
- Worker processes within seconds
- Check your inbox at rvegajr@noctusoft.com

---

## Monitoring

**Check Worker Logs:**
```bash
railway logs --service workers -f
```

**Look for:**
- `[EmailDeliveryWorker] Processing digest for user...`
- `[EmailDeliveryWorker] Sent digest to rvegajr@noctusoft.com`
- `[Job completed] flush_email_digests ...`

---

## Troubleshooting

**401 Unauthorized:**
- Token expired, login again to get new token

**404 Not Found:**
- Check student ID is correct
- Verify you have access to this student

**403 Forbidden:**
- Only account owner or admin can trigger digests
- You should have access as rvegajr@noctusoft.com

**No Email Received:**
- Check spam folder
- Verify email settings in user preferences
- Check Railway logs for delivery errors

---

## Recent Sync Data

Based on the last successful sync:
- ✅ 19 courses extracted from Skyward
- ✅ 10 grades retrieved  
- ✅ 2 assignments captured
- ✅ 11 attendance records logged

**Grade Precedence Active:**
- Skyward (SIS) grades are now primary
- Canvas grades available for reference

---

## Next Steps

1. **Login** to https://app.scholarmancy.com
2. **Get your auth token** from browser DevTools
3. **Get Ava's student ID** from her profile URL
4. **Run the script** or API call with your credentials
5. **Check your email** at rvegajr@noctusoft.com

**Need help?** The endpoint is live and ready to use!
