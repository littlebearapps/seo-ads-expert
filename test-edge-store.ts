#!/usr/bin/env tsx
import { EdgeStoreAnalyzer } from './src/analyzers/edge-store-analyzer.js';
import { readFileSync } from 'fs';
import { join } from 'path';

async function testEdgeStoreAnalyzer() {
  console.log('🔍 Testing Edge Store Analyzer\n');
  
  // Sample Edge Store listing for PaletteKit
  const listing = {
    name: 'PaletteKit - Color Picker Tool',
    shortDescription: 'Advanced color picker Chrome extension with intelligent page scanning and favorites management.',
    detailedDescription: `PaletteKit is a professional color picker tool for Chrome that helps designers and developers capture, organize, and export colors from any website. 

Features intelligent page scanning to automatically detect all colors used on a page, EyeDropper API for pixel-perfect color selection, and a powerful favorites system for managing your color palettes.`,
    keywords: [
      'color picker',
      'palette',
      'design tool',
      'web development',
      'chrome extension'
    ],
    category: 'Developer Tools',
    screenshots: [
      { url: 'screenshot1.png', caption: 'Main interface' },
      { url: 'screenshot2.png', caption: 'Color scanning' },
      { url: 'screenshot3.png', caption: 'Export options' }
    ]
  };
  
  // Load keyword data from a recent plan
  let keywordData = [];
  try {
    const planPath = join('plans', 'palettekit', '2025-09-06', 'keywords.csv');
    const csvContent = readFileSync(planPath, 'utf-8');
    const lines = csvContent.split('\n').slice(1); // Skip header
    
    keywordData = lines
      .filter(line => line.trim())
      .map(line => {
        const cells = line.split(',');
        return {
          keyword: cells[0]?.replace(/"/g, '').trim(),
          volume: parseInt(cells[1]) || 100,
          competition: cells[2] || 'medium',
          cpc: parseFloat(cells[3]) || 1.0,
          score: parseFloat(cells[7]) || 0.5
        };
      })
      .filter(kw => kw.keyword);
      
    console.log(`📊 Loaded ${keywordData.length} keywords from plan\n`);
  } catch (error) {
    console.log('⚠️  Using sample keyword data (plan not found)\n');
    
    // Fallback sample data
    keywordData = [
      { keyword: 'color picker chrome extension', volume: 1000, competition: 'low', cpc: 0.5, score: 0.85 },
      { keyword: 'best color picker', volume: 500, competition: 'medium', cpc: 0.8, score: 0.75 },
      { keyword: 'free color picker tool', volume: 800, competition: 'low', cpc: 0.3, score: 0.70 },
      { keyword: 'eyedropper chrome', volume: 300, competition: 'low', cpc: 0.4, score: 0.65 },
      { keyword: 'web color scanner', volume: 200, competition: 'medium', cpc: 0.6, score: 0.60 },
      { keyword: 'professional color tool', volume: 150, competition: 'high', cpc: 1.2, score: 0.55 },
      { keyword: 'color palette generator', volume: 600, competition: 'medium', cpc: 0.7, score: 0.50 },
      { keyword: 'hex color picker', volume: 400, competition: 'low', cpc: 0.5, score: 0.45 },
      { keyword: 'rgb color tool', volume: 250, competition: 'low', cpc: 0.4, score: 0.40 },
      { keyword: 'design color extension', volume: 180, competition: 'medium', cpc: 0.9, score: 0.35 }
    ];
  }
  
  // Analyze the listing
  const analyzer = new EdgeStoreAnalyzer();
  const optimization = await analyzer.analyzeWithKeywordData(listing, keywordData);
  
  // Display results
  console.log('📋 Edge Store Optimization Report');
  console.log('=' .repeat(60));
  
  console.log('\n📝 Title Optimization');
  console.log(`Current: "${optimization.currentTitle}" (${optimization.currentTitle.length} chars)`);
  console.log('\nRecommended Variants:');
  optimization.titleVariants.forEach((variant, i) => {
    console.log(`\n${i + 1}. "${variant.title}" (${variant.characterCount} chars)`);
    console.log(`   Reasoning: ${variant.reasoning}`);
    if (variant.expectedCTR) {
      console.log(`   Expected CTR Lift: +${(variant.expectedCTR * 100).toFixed(1)}%`);
    }
  });
  
  console.log('\n\n📄 Description Variants');
  optimization.descriptionVariants.forEach(variant => {
    console.log(`\n${variant.type.toUpperCase()} Variant:`);
    console.log(`Short: "${variant.short}"`);
    console.log(`Keywords targeted: ${variant.keywords.slice(0, 3).join(', ')}`);
  });
  
  console.log('\n\n🔑 Keyword Recommendations');
  const toAdd = optimization.keywordRecommendations.filter(r => r.action === 'add').slice(0, 5);
  const toRemove = optimization.keywordRecommendations.filter(r => r.action === 'remove');
  
  if (toAdd.length > 0) {
    console.log('\nAdd these high-value keywords:');
    toAdd.forEach(rec => {
      console.log(`  + "${rec.keyword}" - ${rec.reasoning}`);
    });
  }
  
  if (toRemove.length > 0) {
    console.log('\nRemove these low-relevance keywords:');
    toRemove.forEach(rec => {
      console.log(`  - "${rec.keyword}" - ${rec.reasoning}`);
    });
  }
  
  console.log('\n\n✅ Asset Checklist');
  optimization.assetChecklist.forEach(item => {
    const status = item.present ? '✅' : '❌';
    console.log(`  ${status} ${item.asset}: ${item.recommendation}`);
  });
  
  console.log('\n\n🎯 Prioritized Actions');
  optimization.prioritizedActions.forEach((action, i) => {
    console.log(`  ${i + 1}. ${action}`);
  });
  
  console.log('\n\n📈 Expected Impact');
  console.log(`  Discoverability: +${optimization.expectedLift.discoverability}%`);
  console.log(`  Click-Through Rate: +${optimization.expectedLift.ctr}%`);
  console.log(`  Install Rate: +${optimization.expectedLift.installs}%`);
  
  console.log('\n\n📊 Analysis Summary');
  console.log(`  Keywords Analyzed: ${optimization.keywordCount}`);
  console.log(`  Total Search Volume: ${optimization.totalVolume.toLocaleString()}`);
  
  console.log('\n' + '=' .repeat(60));
  console.log('✅ Edge Store Analysis Complete!\n');
}

// Run the test
testEdgeStoreAnalyzer().catch(console.error);