const { MongoClient } = require('mongodb');

async function findStudents() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB_NAME || 'scholaracle';
  
  console.log('Using URI:', uri.split('@')[1] || uri.slice(0, 30) + '...');
  console.log('Using DB:', dbName);
  
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  
  // Get all students
  const students = await db.collection('students').find({}).limit(10).toArray();
  
  console.log('\nFound', students.length, 'students:');
  students.forEach(s => {
    console.log({
      _id: s._id.toString(),
      name: s.name || s.profile?.name || 'N/A',
      email: s.profile?.email || 'N/A',
      userId: s.userId?.toString() || 'N/A',
      dataSources: s.dataSources?.length || 0
    });
  });
  
  // Also check users for email addresses
  const users = await db.collection('users').find({}).limit(5).toArray();
  console.log('\nFound', users.length, 'users:');
  users.forEach(u => {
    console.log({
      _id: u._id.toString(),
      email: u.email,
      name: u.profile?.name || u.name || 'N/A'
    });
  });
  
  await client.close();
}

findStudents().catch(console.error);
