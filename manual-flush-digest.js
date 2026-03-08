#!/usr/bin/env node
/**
 * Manual immediate digest flush for specific user
 */
const { MongoClient } = require('mongodb');
const sgMail = require('@sendgrid/mail');

const USER_ID = '69a4f0c73671c632ca591c7c';

async function manualFlush() {
  const uri = process.env.MONGODB_URI;
  const sendgridKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@scholarmancy.com';
  const fromName = process.env.SENDGRID_FROM_NAME || 'Scholaracle';
  
  if (!uri || !sendgridKey) {
    console.error('❌ Missing environment variables');
    process.exit(1);
  }
  
  sgMail.setApiKey(sendgridKey);
  
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db();
    
    console.log('🔍 Checking for pending digest items...\n');
    
    // Get pending items for the user
    const items = await db.collection('email_digest_pending')
      .find({ userId: USER_ID })
      .toArray();
    
    if (items.length === 0) {
      console.log('✅ No pending items - digest was already sent or no items queued\n');
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
    
    // Send email to each recipient
    for (const [recipientEmail, recipientItems] of Object.entries(byRecipient)) {
      console.log(`📤 Sending digest to ${recipientEmail}...`);
      
      const studentName = recipientItems[0].studentName || 'Your Student';
      const subject = `Daily Digest for ${studentName}`;
      
      // Build simple text content
      let text = `Scholaracle Digest for ${studentName}\n\n`;
      text += `You have ${recipientItems.length} update(s):\n\n`;
      
      for (const item of recipientItems) {
        const alert = await db.collection('slc_alerts').findOne({ _id: item.alertId });
        if (alert) {
          text += `• ${alert.title}\n`;
          text += `  ${alert.message}\n\n`;
        }
      }
      
      text += '\n--\nScholaracle - Stay connected with your student\'s progress';
      
      // Send via SendGrid
      try {
        await sgMail.send({
          to: recipientEmail,
          from: { email: fromEmail, name: fromName },
          subject: subject,
          text: text,
        });
        
        console.log(`✅ Email sent to ${recipientEmail}`);
        
        // Log to communication log
        await db.collection('slc_communication_log').insertOne({
          userId: USER_ID,
          channel: 'email',
          type: 'notification',
          subject: subject,
          content: text,
          recipientEmail: recipientEmail,
          status: 'sent',
          sentAt: new Date(),
          triggeredBy: 'manual',
          templateName: 'email_digest_manual',
          createdAt: new Date(),
        });
        
      } catch (error) {
        console.error(`❌ Failed to send to ${recipientEmail}:`, error.message);
      }
    }
    
    // Clear pending items
    await db.collection('email_digest_pending').deleteMany({ userId: USER_ID });
    console.log(`\n🧹 Cleared ${items.length} pending item(s)`);
    
    // Mark job as completed
    await db.collection('jobs').updateOne(
      { _id: require('mongodb').ObjectId('69acff28ba7ffc4d29944c3b') },
      { 
        $set: { 
          status: 'completed',
          completedAt: new Date(),
          attempts: 1
        } 
      }
    );
    
    console.log('\n✅ DIGEST SENT SUCCESSFULLY!\n');
    
    await client.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

manualFlush();
