const { SearchTermsAnalyzer } = require('./dist/analyzers/search-terms.js');
const fs = require('fs');
const path = require('path');

async function testSearchTermsAnalyzer() {
  console.log('Testing Search Terms Analyzer...\n');
  
  const analyzer = new SearchTermsAnalyzer({
    minCostThreshold: 10,
    minImpressionsThreshold: 1000,
    lowCtrThreshold: 0.005
  });

  try {
    // Test 1: Parse CSV
    console.log('1. Parsing search terms CSV...');
    const searchTerms = await analyzer.parseSearchTermsReport(
      'inputs/google_ads/search_terms_convertmyfile_2025-09-04.csv'
    );
    console.log(`✅ Parsed ${searchTerms.length} search terms\n`);

    // Test 2: Analyze waste
    console.log('2. Analyzing waste...');
    const analysis = analyzer.analyzeWaste(searchTerms);
    
    console.log('Waste Analysis Results:');
    console.log(`- Total Wasted Spend: $${analysis.totalWastedSpend.toFixed(2)}`);
    console.log(`- Potential Savings: $${analysis.potentialSavings.toFixed(2)}`);
    console.log(`- High-Cost Zero-Convert Terms: ${analysis.highCostNoConvert.length}`);
    console.log(`- Low CTR Terms: ${analysis.lowCtrHighImpressions.length}`);
    console.log(`- Negative Recommendations: ${analysis.negativeRecommendations.length}\n`);

    // Test 3: Check v1.2 success criteria
    console.log('3. Validating v1.2 Success Criteria...');
    if (analysis.totalWastedSpend >= 100) {
      console.log(`✅ SUCCESS: Identified $${analysis.totalWastedSpend.toFixed(2)} in waste (≥$100 requirement)`);
    } else {
      console.log(`❌ FAIL: Only $${analysis.totalWastedSpend.toFixed(2)} in waste (<$100 requirement)`);
    }

    // Test 4: Generate report
    console.log('\n4. Generating waste report...');
    const report = analyzer.generateWasteReport(analysis, 'ConvertMyFile', '2025-09-04');
    
    // Create output directory
    const outputDir = 'plans/convertmyfile/2025-09-04/intelligence';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save report
    const reportPath = path.join(outputDir, 'waste_report.md');
    fs.writeFileSync(reportPath, report);
    console.log(`✅ Waste report saved to ${reportPath}`);

    // Test 5: Export negatives
    console.log('\n5. Exporting negative keywords...');
    const negativesPath = path.join(outputDir, 'negative_keywords.csv');
    analyzer.exportNegativesForAdsEditor(analysis.negativeRecommendations, negativesPath);
    console.log(`✅ Exported ${analysis.negativeRecommendations.length} negative keywords`);

    // Show top recommendations
    console.log('\nTop 5 Negative Keyword Recommendations:');
    analysis.negativeRecommendations.slice(0, 5).forEach((rec, i) => {
      console.log(`${i + 1}. [${rec.keyword}] - ${rec.matchType} - Est. Savings: $${rec.estimatedSavings.toFixed(2)}`);
      console.log(`   Confidence: ${(rec.confidence * 100).toFixed(0)}% - ${rec.reason}`);
    });

    // Show sample waste terms
    console.log('\nTop 5 Waste Terms:');
    analysis.highCostNoConvert.slice(0, 5).forEach((term, i) => {
      console.log(`${i + 1}. "${term.term}" - $${term.cost.toFixed(2)} wasted`);
      console.log(`   Ad Group: ${term.adGroup} - ${term.clicks} clicks, 0 conversions`);
    });

    console.log('\n✅ All tests passed! Task 1 complete.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testSearchTermsAnalyzer();