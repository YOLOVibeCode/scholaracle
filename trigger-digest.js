const https = require('https');

// Find Ava's student and trigger digest
const apiHost = 'api.scholarmancy.com';

// First, get the student ID (you'll need auth token)
// For demo, we'll use a known ID or query

const triggerDigest = (studentId, token) => {
  const data = JSON.stringify({ recipients: 'all' });
  
  const options = {
    hostname: apiHost,
    port: 443,
    path: `/api/students/${studentId}/send-digest`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
      'Authorization': `Bearer ${token}`
    }
  };
  
  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      console.log('\n📧 DIGEST TRIGGER RESPONSE:\n');
      console.log('Status:', res.statusCode);
      console.log('Response:', JSON.parse(body));
      console.log('');
    });
  });
  
  req.on('error', (e) => {
    console.error('Error:', e.message);
  });
  
  req.write(data);
  req.end();
};

// Usage: node trigger-digest.js <studentId> <token>
const [,, studentId, token] = process.argv;

if (!studentId || !token) {
  console.log('Usage: node trigger-digest.js <studentId> <authToken>');
  console.log('');
  console.log('Get studentId from: railway run --service api node -e "..."');
  process.exit(1);
}

triggerDigest(studentId, token);
