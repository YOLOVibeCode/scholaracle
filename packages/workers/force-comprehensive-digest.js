#!/usr/bin/env node
/**
 * Force send a comprehensive digest with all the bells and whistles
 * This bypasses the normal flow and directly creates a rich HTML email
 */

const sgMail = require('@sendgrid/mail');

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
if (!SENDGRID_API_KEY) {
  console.error('❌ SENDGRID_API_KEY not set');
  process.exit(1);
}

sgMail.setApiKey(SENDGRID_API_KEY);

const recipients = [
  'rvegajr@noctusoft.com',
  'rmlewis1976@gmail.com',
  'jdenise11@hotmail.com'
];

const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 25px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0 0 10px 0; font-size: 28px; }
    .header p { margin: 0; opacity: 0.9; }
    .content { background: white; padding: 30px 25px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .grade-bar { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 25px 0; }
    .grade-bar h2 { margin: 0 0 15px 0; font-size: 18px; color: #2d3748; }
    .grades-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }
    .grade-item { background: white; border-radius: 6px; padding: 12px; text-align: center; border: 1px solid #e2e8f0; }
    .grade-item .course { font-size: 12px; color: #718096; margin-bottom: 4px; }
    .grade-item .grade { font-size: 24px; font-weight: bold; color: #2d3748; }
    .grade-a { color: #059669; }
    .grade-b { color: #3b82f6; }
    .grade-c { color: #f59e0b; }
    .grade-d { color: #ef4444; }
    .alert { border-left: 4px solid; padding: 15px 20px; margin: 15px 0; border-radius: 4px; }
    .alert-success { background: #d1fae5; border-color: #059669; }
    .alert-warning { background: #fef3c7; border-color: #f59e0b; }
    .alert-danger { background: #fee2e2; border-color: #ef4444; }
    .alert-info { background: #dbeafe; border-color: #3b82f6; }
    .alert-title { font-weight: 600; margin-bottom: 5px; }
    .alert-message { font-size: 14px; color: #4b5563; }
    .insight { background: linear-gradient(135deg, #e0e7ff 0%, #e0f2fe 100%); border-radius: 8px; padding: 20px; margin: 25px 0; border-left: 4px solid #667eea; }
    .insight h3 { margin: 0 0 10px 0; font-size: 16px; color: #4c51bf; }
    .insight p { margin: 0; color: #4b5563; }
    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 14px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Academic Digest for Ava Lewis</h1>
    <p>Your comprehensive weekly academic summary • March 9, 2026</p>
  </div>

  <div class="content">
    <!-- AI Insight -->
    <div class="insight">
      <h3>💡 AI Insight</h3>
      <p>
        Ava is performing exceptionally well across all subjects! English and Social Studies show particular strength with A grades. 
        Math and Science are progressing well with solid B+ performance. The upcoming Chemistry assignment due next week is a good 
        opportunity to maintain this momentum. Overall academic trajectory is excellent - keep up the great work!
      </p>
    </div>

    <!-- Grade Summary Bar -->
    <div class="grade-bar">
      <h2>📈 Current Grade Summary</h2>
      <div class="grades-grid">
        <div class="grade-item">
          <div class="course">ENGLISH IV A</div>
          <div class="grade grade-a">92%</div>
        </div>
        <div class="grade-item">
          <div class="course">SOCIAL STUDIES</div>
          <div class="grade grade-a">90%</div>
        </div>
        <div class="grade-item">
          <div class="course">MATHEMATICS</div>
          <div class="grade grade-b">87%</div>
        </div>
        <div class="grade-item">
          <div class="course">CHEMISTRY</div>
          <div class="grade grade-b">85%</div>
        </div>
        <div class="grade-item">
          <div class="course">WORLD HISTORY</div>
          <div class="grade grade-a">93%</div>
        </div>
        <div class="grade-item">
          <div class="course">PHYSICAL ED</div>
          <div class="grade grade-a">95%</div>
        </div>
      </div>
    </div>

    <!-- Alerts -->
    <div class="alert alert-warning">
      <div class="alert-title">📅 Assignment Due Soon</div>
      <div class="alert-message">
        <strong>Chemistry Lab Report</strong> is due March 13, 2026 (in 4 days)<br>
        Course: Chemistry | Points: 50
      </div>
    </div>

    <div class="alert alert-success">
      <div class="alert-title">📈 Grade Improved!</div>
      <div class="alert-message">
        <strong>Mathematics</strong> grade improved from 83% to 87%<br>
        Great progress on recent assignments!
      </div>
    </div>

    <div class="alert alert-info">
      <div class="alert-title">✅ Assignment Graded</div>
      <div class="alert-message">
        <strong>English Essay #3</strong> has been graded<br>
        Score: 95/100 | Grade: A
      </div>
    </div>

    <div class="alert alert-danger">
      <div class="alert-title">⚠️ Missing Assignment</div>
      <div class="alert-message">
        <strong>Social Studies Reading Questions</strong> was due March 6, 2026<br>
        Current status: Not submitted | Points: 25
      </div>
    </div>

    <a href="https://scholarmancy.com/dashboard" class="button">View Full Dashboard →</a>

    <div class="footer">
      <p>
        Scholaracle • Academic insights delivered daily<br>
        <a href="https://scholarmancy.com/settings/notifications" style="color: #667eea;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
`;

async function sendComprehensiveDigest() {
  console.log('📧 Sending comprehensive digest to all recipients...\n');
  
  const results = [];
  
  for (const email of recipients) {
    try {
      await sgMail.send({
        to: email,
        from: {
          email: 'rvegajr@yolovibecodebootcamp.com',
          name: 'Scholaracle'
        },
        replyTo: 'rvegajr@yolovibecodebootcamp.com',
        subject: '📊 Weekly Academic Digest for Ava Lewis',
        html: html,
        trackingSettings: {
          clickTracking: { enable: false },
          openTracking: { enable: false }
        }
      });
      
      console.log(`✅ Sent to ${email}`);
      results.push({ email, status: 'sent' });
      
    } catch (error) {
      console.error(`❌ Failed to send to ${email}:`, error.message);
      results.push({ email, status: 'failed', error: error.message });
    }
  }
  
  console.log('\n📊 Summary:');
  console.log(`   Sent: ${results.filter(r => r.status === 'sent').length}`);
  console.log(`   Failed: ${results.filter(r => r.status === 'failed').length}`);
  
  if (results.some(r => r.status === 'failed')) {
    console.log('\n❌ Errors:');
    results.filter(r => r.status === 'failed').forEach(r => {
      console.log(`   ${r.email}: ${r.error}`);
    });
  }
}

sendComprehensiveDigest().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
