#!/usr/bin/env node
const sgMail = require('@sendgrid/mail');

const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) {
  console.error('❌ SENDGRID_API_KEY not set');
  process.exit(1);
}
sgMail.setApiKey(apiKey);

async function testEmail() {
  console.log('🧪 Testing SendGrid Email...\n');
  
  const msg = {
    to: 'rvegajr@noctusoft.com',
    from: {
      email: 'noreply@scholarmancy.com',
      name: 'Scholaracle Test'
    },
    subject: 'SendGrid Test - ' + new Date().toISOString(),
    text: 'This is a test email to verify SendGrid configuration.',
    html: '<strong>This is a test email to verify SendGrid configuration.</strong>',
  };

  try {
    console.log('📤 Sending to:', msg.to);
    console.log('📧 From:', msg.from.email);
    console.log('📝 Subject:', msg.subject);
    console.log();
    
    const response = await sgMail.send(msg);
    console.log('✅ EMAIL SENT SUCCESSFULLY!');
    console.log('Status Code:', response[0].statusCode);
    console.log('Response:', JSON.stringify(response[0].headers, null, 2));
    console.log('\n📬 Check your inbox at rvegajr@noctusoft.com');
  } catch (error) {
    console.error('❌ SENDGRID ERROR:');
    console.error('Message:', error.message);
    if (error.response) {
      console.error('Status:', error.response.statusCode);
      console.error('Body:', error.response.body);
    }
    process.exit(1);
  }
}

testEmail();
