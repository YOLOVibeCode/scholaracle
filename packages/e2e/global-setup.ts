import { chromium, type FullConfig } from '@playwright/test';

/**
 * Global setup for E2E tests.
 * 
 * This runs before all tests to ensure:
 * 1. API server is accessible
 * 2. Database is seeded with live test data (not mocks)
 * 
 * ⚠️ PORT POLICY: Uses FIXED port 2801 for API. DO NOT change this port.
 */
async function globalSetup(config: FullConfig) {
  // Support both 2801 (Docker) and 3002 (manual) ports
  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:2801';
  const seedUrl = `${apiBaseUrl}/api/seed?force=true`;
  
  console.log('🌱 Seeding database with live test data...');
  console.log(`   API URL: ${apiBaseUrl}`);
  console.log(`   Seed URL: ${seedUrl}`);
  
  try {
    // Wait for API to be ready (with retries)
    let apiReady = false;
    const maxRetries = 10;
    let retries = 0;
    
    while (!apiReady && retries < maxRetries) {
      try {
        const healthResponse = await fetch(`${apiBaseUrl}/api/health`);
        if (healthResponse.ok) {
          apiReady = true;
          console.log('✅ API server is ready');
        }
      } catch (error) {
        retries++;
        if (retries < maxRetries) {
          console.log(`   Waiting for API server... (${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    if (!apiReady) {
      throw new Error(`API server not ready after ${maxRetries} retries`);
    }
    
    // Seed the database with live test data
    const seedResponse = await fetch(seedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!seedResponse.ok) {
      const errorText = await seedResponse.text();
      throw new Error(`Seed failed: ${seedResponse.status} ${errorText}`);
    }
    
    const seedResult = await seedResponse.json();
    
    if (!seedResult.success) {
      throw new Error(`Seed failed: ${JSON.stringify(seedResult)}`);
    }
    
    console.log('✅ Database seeded successfully');
    console.log(`   Users created: ${seedResult.totals?.usersCreated || 0}`);
    console.log(`   Admins created: ${seedResult.totals?.adminsCreated || 0}`);
    console.log(`   Students created: ${seedResult.totals?.studentsCreated || 0}`);
    console.log(`   Alerts created: ${seedResult.totals?.alertsCreated || 0}`);
    
    // Verify we have live data (not mocks)
    if (seedResult.totals?.usersCreated === 0 && seedResult.totals?.usersExisting === 0) {
      console.warn('⚠️  Warning: No users were created or found. Tests may fail.');
    }
    
  } catch (error) {
    console.error('❌ Failed to seed database:', error);
    throw error;
  }
}

export default globalSetup;

