#!/usr/bin/env node
const https = require('https');

const email = 'rvegajr@noctusoft.com';
const password = 'P4$$w0rd';

const postData = JSON.stringify({ email, password });

const options = {
  hostname: 'api.scholarmancy.com',
  port: 443,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
  },
};

console.log('🔐 Logging in as', email);

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      if (response.token) {
        console.log('\n✅ Login successful!');
        console.log('\n📋 Your auth token:');
        console.log(response.token);
        console.log('\n📋 Student ID: 67b60f4c6a08c06f7fa0b8e3 (Ava Lewis)');
        console.log('\n🚀 Now run:');
        console.log(`\ncurl -X POST https://api.scholarmancy.com/api/students/67b60f4c6a08c06f7fa0b8e3/send-digest \\`);
        console.log(`  -H "Authorization: Bearer ${response.token}" \\`);
        console.log(`  -H "Content-Type: application/json" \\`);
        console.log(`  -d '{"recipients": ["rvegajr@noctusoft.com"]}'`);
      } else {
        console.log('❌ Login failed:',response);
      }
    } catch (error) {
      console.error('❌ Error parsing response:', error.message);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error.message);
});

req.write(postData);
req.end();
