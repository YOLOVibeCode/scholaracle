const { MongoClient } = require('mongodb');

(async () => {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db();
    
    // Find Ava
    const student = await db.collection('students').findOne({ name: 'Ava Lewis' });
    if (!student) {
      console.log('❌ Student not found');
      process.exit(1);
    }
    
    const userId = student.userId.toString();
    const studentId = student._id.toString();
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║         AVA LEWIS - GRADE PRECEDENCE VERIFICATION         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    // Get last sync
    const lastSync = await db.collection('sync_runs')
      .findOne({ studentId }, { sort: { completedAt: -1 } });
    
    if (lastSync) {
      console.log('📅 LAST SYNC:');
      console.log('   Time:', new Date(lastSync.completedAt).toLocaleString());
      console.log('   Status:', lastSync.status);
      console.log('   Duration:', Math.round(lastSync.durationMs / 1000) + 's');
      console.log('   Data: ' + (lastSync.courseCount || 0) + ' courses, ' + 
                  (lastSync.gradeCount || 0) + ' grades, ' +
                  (lastSync.assignmentCount || 0) + ' assignments');
    }
    
    // Get all courses
    const courses = await db.collection('slc_courses')
      .find({ userId, deletedAt: null })
      .toArray();
    
    // Group by normalized title
    const courseMap = new Map();
    for (const course of courses) {
      const title = (course.record?.title || course.record?.name || '').trim();
      const normalized = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      
      if (!courseMap.has(normalized)) {
        courseMap.set(normalized, []);
      }
      courseMap.get(normalized).push(course);
    }
    
    console.log('\n\n📚 COURSES WITH MULTIPLE SOURCES (Grade Precedence Applied):\n');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    let count = 0;
    for (const [normalized, group] of courseMap) {
      if (group.length > 1) {
        count++;
        const canvas = group.find(c => c.provider === 'canvas');
        const skyward = group.find(c => c.provider === 'skyward');
        
        if (canvas && skyward) {
          const title = canvas.record?.title || skyward.record?.title || 'Unknown';
          const period = canvas.record?.period || skyward.record?.period;
          const teacher = canvas.record?.teacherName || skyward.record?.teacherName;
          
          console.log('📖 ' + title);
          if (period) console.log('   Period: ' + period);
          if (teacher) console.log('   Teacher: ' + teacher);
          console.log('');
          
          const canvasGrade = canvas.record?.currentGrade || canvas.record?.grade;
          const skywardGrade = skyward.record?.currentGrade || skyward.record?.grade;
          
          console.log('   Canvas (LMS):  ' + (canvasGrade || 'N/A'));
          console.log('   Skyward (SIS): ' + (skywardGrade || 'N/A') + ' ⭐ PRIMARY');
          
          if (canvasGrade && skywardGrade) {
            const cNum = parseFloat(canvasGrade.toString().replace('%', ''));
            const sNum = parseFloat(skywardGrade.toString().replace('%', ''));
            if (!isNaN(cNum) && !isNaN(sNum)) {
              const diff = Math.abs(cNum - sNum);
              if (diff > 1) {
                console.log('   📊 Difference: ' + diff.toFixed(1) + '%');
                if (cNum > sNum) {
                  console.log('   ⚠️  Canvas shows higher (projected/extra credit)');
                  console.log('   ✅ Skyward is official grade (takes precedence)');
                }
              }
            }
          }
          console.log('');
        }
      }
    }
    
    if (count === 0) {
      console.log('   No courses with multiple sources found.\n');
    } else {
      console.log('═══════════════════════════════════════════════════════════\n');
      console.log('✅ Found ' + count + ' courses with data from multiple sources');
      console.log('   Grade precedence system: Skyward (SIS) is authoritative\n');
    }
    
    // Show all unique courses
    const uniqueCourses = Array.from(courseMap.values())
      .map(group => {
        const course = group[0];
        return {
          title: course.record?.title || course.record?.name,
          provider: course.provider,
          period: course.record?.period,
          grade: course.record?.currentGrade || course.record?.grade
        };
      })
      .filter(c => c.title);
    
    console.log('\n📋 ALL COURSES (' + uniqueCourses.length + ' total):\n');
    uniqueCourses
      .sort((a, b) => (a.period || '').localeCompare(b.period || ''))
      .forEach(c => {
        console.log('   • ' + c.title + ' (' + c.provider + ')' +
                    (c.period ? ' - Period ' + c.period : '') +
                    (c.grade ? ' - ' + c.grade : ''));
      });
    
    console.log('\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
