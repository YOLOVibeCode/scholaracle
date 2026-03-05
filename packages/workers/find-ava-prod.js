const { MongoClient } = require('mongodb');

async function findAva() {
  const uri = 'mongodb://mongo:***REMOVED***@shinkansen.proxy.rlwy.net:45948';
  const dbName = 'scholaracle';
  
  console.log('Connecting to production database...');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  
  // Look for student with email containing "alewis" or name containing "Ava"
  const students = await db.collection('students').find({
    $or: [
      { 'profile.email': /alewis/i },
      { 'profile.name': /ava/i },
      { name: /ava/i }
    ]
  }).toArray();
  
  console.log('\nFound', students.length, 'student(s) matching Ava:');
  students.forEach(s => {
    console.log({
      _id: s._id.toString(),
      name: s.name || s.profile?.name,
      email: s.profile?.email,
      userId: s.userId?.toString(),
      dataSources: s.dataSources?.length || 0,
      sources: s.dataSources?.map(ds => ds.pluginId).join(', ') || 'none'
    });
  });
  
  // Also search for user with rvegajr email to find their students
  const users = await db.collection('users').find({
    email: /rvegajr|darkware/i
  }).toArray();
  
  console.log('\nFound', users.length, 'user(s) matching rvegajr:');
  for (const u of users) {
    console.log({
      _id: u._id.toString(),
      email: u.email,
      name: u.profile?.name || u.name || 'N/A'
    });
    
    // Find students for this user
    const userStudents = await db.collection('students').find({
      userId: u._id
    }).toArray();
    
    console.log('  Students for this user:');
    userStudents.forEach(s => {
      console.log('   -', {
        _id: s._id.toString(),
        name: s.name,
        dataSources: s.dataSources?.length || 0,
        sources: s.dataSources?.map(ds => ds.pluginId).join(', ') || 'none'
      });
    });
  }
  
  await client.close();
}

findAva().catch(console.error);
