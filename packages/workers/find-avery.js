const { MongoClient } = require('mongodb');

async function findAva() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB_NAME || 'scholaracle';
  
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  
  // Look for student with email containing "student.one" or name containing "Avery"
  const students = await db.collection('students').find({
    $or: [
      { 'profile.email': /student.one/i },
      { 'profile.name': /avery/i },
      { name: /avery/i }
    ]
  }).toArray();
  
  console.log('Found students:', JSON.stringify(students.map(s => ({
    _id: s._id,
    name: s.name || s.profile?.name,
    email: s.profile?.email,
    userId: s.userId,
    dataSourcesCount: s.dataSources?.length || 0
  })), null, 2));
  
  await client.close();
}

findAva().catch(console.error);
