import { MongoClient, ObjectId } from 'mongodb';
import * as jwt from 'jsonwebtoken';

const MONGODB_URI = 'mongodb://mongo:***REMOVED***@shinkansen.proxy.rlwy.net:45948';
const JWT_SECRET = 'd1eb82c6836e859f272a248c04dc7edbb33fca209b0120bceb3cfe285ee1188b';
const API_URL = 'https://api.scholarmancy.com';
const AVA_STUDENT_ID = '69a4f1b53671c632ca591c7f';
const AVA_USER_ID = '69a4f0c73671c632ca591c7c';

async function main() {
  console.log('Step 1: Creating JWT token...');
  const token = jwt.sign({ userId: AVA_USER_ID }, JWT_SECRET, { expiresIn: '1h' });

  console.log('\nStep 2: Adding Skyward data source...');
  const skywardPayload = {
    pluginId: 'skyward::browser',
    enabled: true,
    config: {
      institutionUrl: 'https://skyward.iscorp.com/scripts/wsisa.dll/WService=wscomlakedallastx/seplog01.w'
    },
    credentials: {
      username: 'Jessica.Lewis',
      password: '123456789'
    }
  };

  const skywardRes = await fetch(`${API_URL}/api/students/${AVA_STUDENT_ID}/sources`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(skywardPayload)
  });

  if (!skywardRes.ok) {
    const err = await skywardRes.text();
    console.error('Skyward failed:', skywardRes.status, err);
  } else {
    const skyward = await skywardRes.json();
    console.log('Skyward added:', (skyward as any).sourceId || (skyward as any).id);
  }

  console.log('\nStep 3: Adding Google Classroom data source...');
  const googlePayload = {
    pluginId: 'google-classroom::api',
    enabled: true,
    config: {
      institutionUrl: 'https://classroom.googleapis.com'
    },
    credentials: {
      email: '29alewis@ldisd.net',
      password: 'avalewisldhs'
    }
  };

  const googleRes = await fetch(`${API_URL}/api/students/${AVA_STUDENT_ID}/sources`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(googlePayload)
  });

  if (!googleRes.ok) {
    const err = await googleRes.text();
    console.error('Google Classroom failed:', googleRes.status, err);
  } else {
    const google = await googleRes.json();
    console.log('Google Classroom added:', (google as any).sourceId || (google as any).id);
  }

  console.log('\nStep 4: Triggering sync...');
  const syncRes = await fetch(`${API_URL}/api/sync/students/${AVA_STUDENT_ID}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!syncRes.ok) {
    const err = await syncRes.text();
    console.error('Sync trigger failed:', syncRes.status, err);
    process.exit(1);
  }

  const syncResult = await syncRes.json();
  console.log('Sync triggered! Job IDs:', (syncResult as any).jobIds);
  console.log('\nNow running digest send script...');
  console.log('Export these and run: npx ts-node src/scripts/send-digest-now.ts --studentId=' + AVA_STUDENT_ID);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
