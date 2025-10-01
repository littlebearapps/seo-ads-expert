#!/usr/bin/env node

/**
 * Migration Transaction Policy Validator Script
 * CLI script to validate migration files follow transaction policy
 */

import { validateMigrationTransactionPolicy } from '../src/database/transaction-policy-guard.js';

async function main() {
  try {
    console.log('🔍 Validating migration transaction policy...');

    const result = await validateMigrationTransactionPolicy();

    if (result.valid) {
      console.log('✅ All migration files follow transaction policy');
      process.exit(0);
    } else {
      console.log('❌ Migration policy violations found:');
      console.log(result.summary);
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Validation failed:', error.message);
    process.exit(1);
  }
}

main();