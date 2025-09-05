#!/usr/bin/env node

/**
 * Test script for v1.4 functionality
 * Run with: node test-v14.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

async function runCommand(command, args) {
  return new Promise((resolve) => {
    console.log(`${colors.yellow}Running: ${command} ${args.join(' ')}${colors.reset}`);
    
    const child = spawn(command, args, {
      cwd: __dirname,
      stdio: 'pipe'
    });
    
    let output = '';
    let error = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });
    
    child.stderr.on('data', (data) => {
      error += data.toString();
      process.stderr.write(data);
    });
    
    child.on('close', (code) => {
      resolve({ code, output, error });
    });
  });
}

async function testV14() {
  console.log('🧪 Testing v1.4 SEO Ads Expert Features\n');
  
  const tests = [
    {
      name: 'Test 1: Ingest CSV Data',
      command: 'node',
      args: ['dist/cli.js', 'performance', 'ingest-ads', 
             '--product', 'convertmyfile',
             '--from', 'csv',
             '--file', join(__dirname, 'inputs/google_ads/convertmyfile/search_terms_test.csv')]
    },
    {
      name: 'Test 2: Analyze Waste',
      command: 'node',
      args: ['dist/cli.js', 'performance', 'analyze-waste',
             '--product', 'convertmyfile',
             '--window', '30',
             '--min-spend', '5']
    },
    {
      name: 'Test 3: Quality Score Analysis',
      command: 'node',
      args: ['dist/cli.js', 'performance', 'quality-score',
             '--product', 'convertmyfile']
    },
    {
      name: 'Test 4: Paid/Organic Gaps',
      command: 'node',
      args: ['dist/cli.js', 'performance', 'paid-organic-gaps',
             '--product', 'convertmyfile']
    }
  ];
  
  // First compile TypeScript
  console.log('📦 Compiling TypeScript...\n');
  const { code: tscCode } = await runCommand('npx', ['tsc', '--build']);
  
  if (tscCode !== 0) {
    console.log(`${colors.red}❌ TypeScript compilation failed${colors.reset}`);
    return;
  }
  
  console.log(`${colors.green}✅ TypeScript compiled successfully${colors.reset}\n`);
  
  // Run tests
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    console.log(`\n${colors.yellow}${test.name}${colors.reset}`);
    console.log('─'.repeat(50));
    
    const { code, output, error } = await runCommand(test.command, test.args);
    
    if (code === 0 && !error.includes('Error')) {
      console.log(`${colors.green}✅ PASSED${colors.reset}`);
      passed++;
    } else {
      console.log(`${colors.red}❌ FAILED (exit code: ${code})${colors.reset}`);
      if (error) console.log(`Error: ${error}`);
      failed++;
    }
  }
  
  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('📊 Test Summary:');
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
  
  if (failed === 0) {
    console.log(`\n${colors.green}🎉 All v1.4 tests passed!${colors.reset}`);
    
    // Check for generated reports
    console.log('\n📁 Checking for generated reports...');
    const performanceDir = join(__dirname, 'performance/convertmyfile');
    
    try {
      const files = await fs.readdir(performanceDir, { recursive: true });
      console.log('Found files:', files);
    } catch (e) {
      console.log('No performance directory found yet');
    }
  } else {
    console.log(`\n${colors.red}⚠️  Some tests failed. Please review the errors above.${colors.reset}`);
  }
}

// Run tests
testV14().catch(console.error);