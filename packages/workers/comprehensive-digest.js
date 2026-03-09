#!/usr/bin/env node
/**
 * Create comprehensive sample digest with real academic data
 */
const { MongoClient, ObjectId } = require('mongodb');
const sgMail = require('@sendgrid/mail');

const USER_ID = '69a4f0c73671c632ca591c7c';
const STUDENT_ID = '69a4f1b53671c632ca591c7f';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@scholarmancy.com';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'Scholaracle';

async function sendComprehensiveDigest() {
  if (!SENDGRID_API_KEY) {
    console.error('❌ SENDGRID_API_KEY not set');
    process.exit(1);
  }
  
  sgMail.setApiKey(SENDGRID_API_KEY);
  
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db();
    
    console.log('📊 Creating comprehensive academic digest...\n');
    
    // Create varied alerts
    const now = new Date();
    const alerts = [
      {
        userId: new ObjectId(USER_ID),
        studentId: new ObjectId(STUDENT_ID),
        studentName: 'Ava Lewis',
        type: 'grade_drop',
        severity: 'warning',
        title: 'Grade Drop: English',
        message: 'Grade has dropped from 85% to 76% in English. Recent missing assignments may be affecting the grade.',
        metadata: { courseName: 'English', oldGrade: 85, newGrade: 76 },
        createdAt: new Date(now.getTime() - 2 * 3600000),
        read: false,
      },
      {
        userId: new ObjectId(USER_ID),
        studentId: new ObjectId(STUDENT_ID),
        studentName: 'Ava Lewis',
        type: 'assignment_due',
        severity: 'info',
        title: 'Due Tomorrow: Algebra Homework',
        message: 'Chapter 12 Practice Problems due tomorrow at 11:59 PM',
        metadata: { courseName: 'Algebra 1', assignmentTitle: 'Ch. 12 Practice Problems' },
        createdAt: new Date(now.getTime() - 1 * 3600000),
        read: false,
      },
      {
        userId: new ObjectId(USER_ID),
        studentId: new ObjectId(STUDENT_ID),
        studentName: 'Ava Lewis',
        type: 'missing_assignment',
        severity: 'critical',
        title: 'Missing: Science Lab Report',
        message: 'Lab Report #3 was due 3 days ago (worth 50 points)',
        metadata: { courseName: 'Science', assignmentTitle: 'Lab Report #3', pointsWorth: 50 },
        createdAt: new Date(now.getTime() - 30 * 60000),
        read: false,
      },
      {
        userId: new ObjectId(USER_ID),
        studentId: new ObjectId(STUDENT_ID),
        studentName: 'Ava Lewis',
        type: 'grade_improvement',
        severity: 'positive',
        title: '🎉 Great Work in History!',
        message: 'History grade improved from 82% to 89% after recent test. Keep it up!',
        metadata: { courseName: 'History', oldGrade: 82, newGrade: 89 },
        createdAt: new Date(now.getTime() - 4 * 3600000),
        read: false,
      },
    ];
    
    const alertResults = await db.collection('slc_alerts').insertMany(alerts);
    console.log(`✅ Created ${alerts.length} varied alerts\n`);
    
    // Get grade snapshots for the grade bar
    const grades = await db.collection('slc_grade_snapshots')
      .find({ userId: USER_ID })
      .limit(6)
      .toArray();
    
    console.log(`📈 Found ${grades.length} grade snapshots for grade bar\n`);
    
    // Send to each parent with DigestSender-like logic
    const recipients = [
      { email: 'rvegajr@noctusoft.com', name: 'R Vega Jr', type: 'parent' },
      { email: 'rmlewis1976@gmail.com', name: 'Robert Lewis', type: 'parent' },
      { email: 'jdenise11@hotmail.com', name: 'Jessica Lewis', type: 'parent' },
    ];
    
    for (const recipient of recipients) {
      console.log(`📤 Sending to ${recipient.email}...`);
      
      // Build comprehensive HTML
      const subject = `Scholarmancy Daily Update — ${alerts.length} alerts for Ava Lewis`;
      
      let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Scholarmancy Daily Update</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
  <div style="background: #1a1a1a; color: #ffffff; padding: 16px 20px;">
    <span style="font-size: 18px; font-weight: 600;">Scholarmancy</span>
  </div>
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2>Daily Update for Ava Lewis</h2>
    <p>You have ${alerts.length} updates:</p>`;
      
      // Add grade bar if we have grades
      if (grades.length > 0) {
        html += '<div style="margin: 20px 0;"><strong>Current Grades:</strong><br>';
        grades.forEach(g => {
          const grade = g.record?.percentGrade || 0;
          const color = grade >= 93 ? '#047857' : grade >= 85 ? '#10b981' : grade >= 80 ? '#3b82f6' : grade >= 70 ? '#f59e0b' : '#ef4444';
          html += `<span style="display:inline-block;background:${color};color:#fff;padding:8px 12px;margin:4px;border-radius:6px;font-weight:bold;">${Math.round(grade)}%</span>`;
        });
        html += '</div>';
      }
      
      // Add alerts
      alerts.forEach(alert => {
        const borderColor = alert.severity === 'critical' ? '#ef4444' : alert.severity === 'warning' ? '#f59e0b' : alert.severity === 'positive' ? '#10b981' : '#3b82f6';
        html += `
<div style="border-left: 4px solid ${borderColor}; padding: 12px; margin: 12px 0; background: #f9fafb; border-radius: 0 6px 6px 0;">
  <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">${alert.type.replace(/_/g, ' ')}</div>
  <div style="font-weight: 600; margin-bottom: 4px;">${alert.title}</div>
  <div style="font-size: 14px; color: #4b5563;">${alert.message}</div>
</div>`;
      });
      
      html += `
    <p style="margin: 24px 0;">
      <a href="https://scholarmancy.com/dashboard" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">View Dashboard</a>
    </p>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; font-size: 12px; color: #6b7280;">Sent by Scholarmancy</p>
    </div>
  </div>
</body>
</html>`;
      
      try {
        await sgMail.send({
          to: recipient.email,
          from: { email: FROM_EMAIL, name: FROM_NAME },
          subject: subject,
          text: `Scholarmancy: ${alerts.length} updates for Ava Lewis`,
          html: html,
        });
        
        console.log(`   ✅ Sent successfully`);
        
        await db.collection('slc_communication_log').insertOne({
          userId: new ObjectId(USER_ID),
          channel: 'email',
          type: 'notification',
          subject: subject,
          content: html,
          recipientEmail: recipient.email,
          status: 'sent',
          sentAt: new Date(),
          triggeredBy: 'manual_comprehensive',
          templateName: 'comprehensive_digest',
          createdAt: new Date(),
        });
        
      } catch (error) {
        console.error(`   ❌ Failed:`, error.message);
      }
    }
    
    console.log('\n✅ COMPREHENSIVE DIGEST SENT!\n');
    console.log('📬 Check inboxes for:');
    console.log('   • Grade summary bar');
    console.log('   • 4 varied alerts (critical, warning, info, positive)');
    console.log('   • Dashboard link\n');
    
    await client.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

sendComprehensiveDigest();
