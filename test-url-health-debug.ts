#!/usr/bin/env npx tsx
import { UrlHealthChecker } from './src/validators/url-health.js';

async function debug() {
  const checker = new UrlHealthChecker({
    timeout: 5000,
    checkRobotsTxt: false,
    checkPerformance: true
  });

  console.log('🧪 Testing URL health checker...\n');

  try {
    // Test 1: Good URL
    console.log('Testing good URL: https://httpbin.org/html');
    const goodResult = await checker.checkUrlHealth('https://httpbin.org/html');
    console.log('Result status:', goodResult.status);
    console.log('HTTP code:', goodResult.metadata.httpCode);
    console.log('Title:', goodResult.metadata.title);
    console.log('Errors:', goodResult.errors);
    console.log('Warnings:', goodResult.warnings);
    console.log('---\n');

    // Test 2: 404 URL  
    console.log('Testing 404 URL: https://httpbin.org/status/404');
    const failResult = await checker.checkUrlHealth('https://httpbin.org/status/404');
    console.log('Result status:', failResult.status);
    console.log('HTTP code:', failResult.metadata.httpCode);
    console.log('Errors:', failResult.errors);
    console.log('---\n');

  } catch (error) {
    console.error('Error during testing:', error);
  }
}

debug().catch(console.error);