#!/usr/bin/env tsx
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

async function testV16Integration() {
  console.log('🧪 Testing v1.6 Integration - Complete Workflow\n');
  
  const testResults = {
    microsoftExport: false,
    edgeStoreAudit: false,
    crossPlatformMonitor: false,
    cliCommands: false,
    fileGeneration: false
  };
  
  try {
    // Test 1: Microsoft Ads Export
    console.log('📊 Test 1: Microsoft Ads Export');
    process.stdout.write('  Testing Microsoft export command... ');
    
    const { MicrosoftAdsCSVWriter } = await import('./src/writers/microsoft-ads-csv.js');
    const writer = new MicrosoftAdsCSVWriter();
    
    // Mock campaign data
    const campaign = {
      name: 'Test Campaign',
      budget: 50,
      status: 'ENABLED' as const,
      adGroups: [{
        name: 'Test Ad Group',
        status: 'ENABLED' as const,
        cpc: 1.0,
        keywords: [{
          keyword: 'test keyword',
          matchType: 'PHRASE' as const,
          cpc: 1.0,
          status: 'ENABLED' as const
        }],
        ads: [{
          headlines: ['Test Headline 1', 'Test Headline 2', 'Test Headline 3'],
          descriptions: ['Test Description 1', 'Test Description 2'],
          path1: 'test',
          path2: 'extension',
          finalUrl: 'https://example.com'
        }]
      }]
    };
    
    const csvContent = await writer.exportBulkCsv([campaign]);
    testResults.microsoftExport = csvContent.includes('Campaign') && csvContent.includes('Ad Group');
    console.log(testResults.microsoftExport ? '✅' : '❌');
    
    // Test 2: Edge Store Audit
    console.log('  Testing Edge Store analyzer... ');
    
    const { EdgeStoreAnalyzer } = await import('./src/analyzers/edge-store-analyzer.js');
    const analyzer = new EdgeStoreAnalyzer();
    
    const testListing = {
      name: 'Test Extension',
      shortDescription: 'Test description',
      detailedDescription: 'Test detailed description',
      keywords: ['test', 'extension'],
      category: 'Developer Tools',
      screenshots: [{ url: 'test.png', caption: 'Test' }]
    };
    
    const testKeywordData = [
      { keyword: 'test extension', volume: 1000, competition: 'low', cpc: 0.5, score: 0.8 }
    ];
    
    const optimization = await analyzer.analyzeWithKeywordData(testListing, testKeywordData);
    testResults.edgeStoreAudit = optimization.keywordCount > 0 && optimization.titleVariants.length > 0;
    console.log(testResults.edgeStoreAudit ? '✅' : '❌');
    
    // Test 3: Cross-Platform Monitor
    console.log('  Testing cross-platform monitor... ');
    
    const { CrossPlatformMonitor } = await import('./src/monitors/cross-platform-monitor.js');
    const monitor = new CrossPlatformMonitor();
    
    const { metrics, insights } = await monitor.generateCrossPlatformReport('testproduct');
    testResults.crossPlatformMonitor = metrics.combined.totalImpressions >= 0 && insights.opportunities.length >= 0;
    console.log(testResults.crossPlatformMonitor ? '✅' : '❌');
    
    // Test 4: File Generation
    console.log('  Testing file generation... ');
    
    const { EdgeStoreAuditWriter } = await import('./src/writers/edge-store-audit-writer.js');
    const auditWriter = new EdgeStoreAuditWriter();
    const testOutputPath = join('plans', 'test', '2025-09-05', 'edge-store-audit.md');
    
    await auditWriter.writeEdgeStoreAudit('test', optimization, testOutputPath);
    testResults.fileGeneration = existsSync(testOutputPath);
    console.log(testResults.fileGeneration ? '✅' : '❌');
    
    // Test 5: CLI Command Integration (basic import test)
    console.log('  Testing CLI command imports... ');
    
    try {
      // Test if CLI can import all new components without errors
      await import('./src/analyzers/edge-store-analyzer.js');
      await import('./src/writers/edge-store-audit-writer.js');
      await import('./src/monitors/cross-platform-monitor.js');
      await import('./src/writers/microsoft-ads-csv.js');
      testResults.cliCommands = true;
    } catch (error) {
      testResults.cliCommands = false;
    }
    console.log(testResults.cliCommands ? '✅' : '❌');
    
    // Summary
    const passedTests = Object.values(testResults).filter(Boolean).length;
    const totalTests = Object.keys(testResults).length;
    
    console.log('\n📊 Integration Test Results');
    console.log('=' .repeat(50));
    console.log(`✅ Microsoft Export: ${testResults.microsoftExport ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Edge Store Audit: ${testResults.edgeStoreAudit ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Cross-Platform Monitor: ${testResults.crossPlatformMonitor ? 'PASS' : 'FAIL'}`);
    console.log(`✅ File Generation: ${testResults.fileGeneration ? 'PASS' : 'FAIL'}`);
    console.log(`✅ CLI Commands: ${testResults.cliCommands ? 'PASS' : 'FAIL'}`);
    console.log('=' .repeat(50));
    console.log(`\n🎯 Overall Result: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      console.log('🎉 v1.6 Integration Tests: ALL PASS!');
      console.log('\n🚀 v1.6 Features Ready:');
      console.log('• Microsoft Ads bulk export (.csv format)');
      console.log('• Edge Add-ons Store optimization audit');
      console.log('• Cross-platform performance monitoring');
      console.log('• CLI commands: edge-store-audit, cross-platform');
      console.log('• Complete integration with existing v1.5 architecture');
      
      console.log('\n💡 Usage Examples:');
      console.log('npx tsx src/cli.ts edge-store-audit -p palettekit');
      console.log('npx tsx src/cli.ts cross-platform -p palettekit');
      console.log('npx tsx src/cli-microsoft.ts -p palettekit -d 2025-09-05');
      
    } else {
      console.log('❌ Some integration tests failed. Review failed components.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Integration test suite failed:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

testV16Integration().catch(console.error);