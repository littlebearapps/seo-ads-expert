#!/usr/bin/env tsx
import { EdgeStoreAnalyzer } from './src/analyzers/edge-store-analyzer.js';
import { EdgeStoreAuditWriter } from './src/writers/edge-store-audit-writer.js';
import { join } from 'path';

async function testEdgeStoreAudit() {
  console.log('📝 Testing Edge Store Audit Writer\n');
  
  // Sample listing
  const listing = {
    name: 'PaletteKit - Color Picker Tool',
    shortDescription: 'Advanced color picker Chrome extension with intelligent page scanning and favorites management.',
    detailedDescription: `PaletteKit is a professional color picker tool for Chrome that helps designers and developers capture, organize, and export colors from any website. Features intelligent page scanning and favorites management.`,
    keywords: ['color picker', 'palette', 'design tool', 'web development', 'chrome extension'],
    category: 'Developer Tools',
    screenshots: [
      { url: 'screenshot1.png', caption: 'Main interface' },
      { url: 'screenshot2.png', caption: 'Color scanning' },
      { url: 'screenshot3.png', caption: 'Export options' }
    ]
  };
  
  // Sample keyword data
  const keywordData = [
    { keyword: 'color picker chrome extension', volume: 1000, competition: 'low', cpc: 0.5, score: 0.85 },
    { keyword: 'best color picker', volume: 500, competition: 'medium', cpc: 0.8, score: 0.75 },
    { keyword: 'free color picker tool', volume: 800, competition: 'low', cpc: 0.3, score: 0.70 },
    { keyword: 'eyedropper chrome', volume: 300, competition: 'low', cpc: 0.4, score: 0.65 },
    { keyword: 'web color scanner', volume: 200, competition: 'medium', cpc: 0.6, score: 0.60 },
    { keyword: 'professional color tool', volume: 150, competition: 'high', cpc: 1.2, score: 0.55 },
    { keyword: 'color palette generator', volume: 600, competition: 'medium', cpc: 0.7, score: 0.50 },
    { keyword: 'hex color picker', volume: 400, competition: 'low', cpc: 0.5, score: 0.45 }
  ];
  
  // Run analysis
  const analyzer = new EdgeStoreAnalyzer();
  const optimization = await analyzer.analyzeWithKeywordData(listing, keywordData);
  
  // Generate audit report
  const writer = new EdgeStoreAuditWriter();
  const outputPath = join('plans', 'palettekit', '2025-09-06', 'edge-store-audit.md');
  await writer.writeEdgeStoreAudit('PaletteKit', optimization, outputPath);
  
  console.log('✅ Edge Store audit report generated successfully!');
  console.log(`📁 Report saved to: ${outputPath}`);
  console.log('\n📊 Report includes:');
  console.log('   - Title optimization variants');
  console.log('   - Description A/B testing options');
  console.log('   - Keyword strategy recommendations');
  console.log('   - Asset optimization checklist');
  console.log('   - Prioritized action plan');
  console.log('   - Performance tracking guidelines');
  console.log('   - Implementation timeline');
  
  // Show sample of the content
  console.log('\n📖 Sample Content Preview:');
  console.log('-'.repeat(60));
  console.log(`Expected Impact:`);
  console.log(`- Discoverability: +${optimization.expectedLift.discoverability}%`);
  console.log(`- Click-Through Rate: +${optimization.expectedLift.ctr}%`);
  console.log(`- Install Rate: +${optimization.expectedLift.installs}%`);
  console.log(`- Keywords Analyzed: ${optimization.keywordCount}`);
  console.log(`- Total Search Volume: ${optimization.totalVolume.toLocaleString()}`);
  console.log('-'.repeat(60));
}

testEdgeStoreAudit().catch(console.error);