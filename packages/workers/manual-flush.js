#!/usr/bin/env node
/**
 * Manual digest flush - bypasses job system and directly flushes pending items
 */
const { MongoClient, ObjectId } = require('mongodb');
const sgMail = require('@sendgrid/mail');

const USER_ID = '69a4f0c73671c632ca591c7c';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@scholarmancy.com';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'Scholaracle';

async function manualFlush() {
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
    
    console.log('🔍 Looking for pending digest items...\n');
    
    // Get pending items
    const items = await db.collection('email_digest_pending')
      .find({ userId: USER_ID })
      .toArray();
    
    if (items.length === 0) {
      console.log('✅ No pending items found - queue is empty\n');
      await client.close();
      return;
    }
    
    console.log(`📧 Found ${items.length} pending item(s)\n`);
    
    // Group by recipient
    const byRecipient = {};
    for (const item of items) {
      const email = item.recipientEmail;
      if (!byRecipient[email]) byRecipient[email] = [];
      byRecipient[email].push(item);
    }
    
    console.log(`📬 Sending to ${Object.keys(byRecipient).length} recipient(s)...\n`);
    
    // Send to each recipient
    for (const [recipientEmail, recipientItems] of Object.entries(byRecipient)) {
      console.log(`📤 Sending to ${recipientEmail}...`);
      
      const studentName = recipientItems[0].studentName || 'Your Student';
      const subject = `Daily Digest for ${studentName}`;
      
      //Build email content
      let html = `<h2>Scholaracle Digest for ${studentName}</h2>`;
      html += `<p>You have ${recipientItems.length} update(s):</p><ul>`;
      
      for (const item of recipientItems) {
        const alertId = typeof item.alertId === 'string' ? new ObjectId(item.alertId) : item.alertId;
        const alert = await db.collection('slc_alerts').findOne({ _id: alertId });
        if (alert) {
          html += `<li><strong>${alert.title}</strong><br>${alert.message}</li>`;
        }
      }
      
      html += '</ul><p>--<br>Scholaracle</p>';
      
      try {
        await sgMail.send({
          to: recipientEmail,
          from: { email: FROM_EMAIL, name: FROM_NAME },
          subject: subject,
          text: `Scholaracle Digest: ${recipientItems.length} updates for ${studentName}`,
          html: html,
        });
        
        console.log(`   ✅ Sent successfully`);
        
        // Log it
        await db.collection('slc_communication_log').insertOne({
          userId: new ObjectId(USER_ID),
          channel: 'email',
          type: 'notification',
          subject: subject,
          content: html,
          recipientEmail: recipientEmail,
          status: 'sent',
          sentAt: new Date(),
          triggeredBy: 'manual',
          templateName: 'email_digest_manual',
          createdAt: new Date(),
        });
        
      } catch (error) {
        console.error(`   ❌ Failed:`, error.message);
      }
    }
    
    // Clear pending items
    const deleteResult = await db.collection('email_digest_pending').deleteMany({ userId: USER_ID });
    console.log(`\n🧹 Cleared ${deleteResult.deletedCount} pending item(s)`);
    
    console.log('\n✅ MANUAL FLUSH COMPLETE!\n');
    
    await client.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

manualFlush();
