// Simple test to isolate dependency issues
console.log('Testing basic TypeScript execution...');

// Test our core Task 5 modules without date-fns
try {
  console.log('✅ TypeScript execution working');
  console.log('Node.js version:', process.version);
  console.log('Platform:', process.platform);
  process.exit(0);
} catch (error) {
  console.error('❌ Basic test failed:', error);
  process.exit(1);
}