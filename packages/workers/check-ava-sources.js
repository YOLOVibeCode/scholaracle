const { MongoClient, ObjectId } = require('mongodb');

async function checkAva() {
  const uri = 'mongodb://mongo:***REMOVED***@shinkansen.proxy.rlwy.net:45948';
  const dbName = 'scholaracle';
  const avaStudentId = '69a4f1b53671c632ca591c7f';
  
  console.log('Checking Ava Lewis student record...\n');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  
  const student = await db.collection('students').findOne({ 
    _id: new ObjectId(avaStudentId) 
  });
  
  if (!student) {
    console.log('Student not found!');
    await client.close();
    return;
  }
  
  console.log('Student:', student.name);
  console.log('User ID:', student.userId?.toString());
  console.log('Data Sources:', student.dataSources?.length || 0);
  
  if (student.dataSources && student.dataSources.length > 0) {
    console.log('\nData Sources:');
    student.dataSources.forEach((ds, i) => {
      console.log(`  ${i + 1}. ${ds.pluginId}`);
      console.log(`     ID: ${ds.id}`);
      console.log(`     Enabled: ${ds.enabled !== false}`);
      console.log(`     URL: ${ds.config?.institutionUrl || 'N/A'}`);
      console.log(`     Has credentials: ${ds.credentials ? 'Yes' : 'No'}`);
    });
  } else {
    console.log('\nNo data sources configured!');
  }
  
  // Check shared contacts
  console.log('\nShared with:');
  if (student.sharedWith && student.sharedWith.length > 0) {
    for (const contact of student.sharedWith) {
      const contactUser = await db.collection('users').findOne({
        _id: new ObjectId(contact.userId)
      });
      console.log(`  - ${contactUser?.email} (${contact.status})`);
    }
  } else {
    console.log('  No contacts');
  }
  
  await client.close();
}

checkAva().catch(console.error);
