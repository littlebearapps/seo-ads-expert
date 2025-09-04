// Comprehensive waste analysis test
const fs = require('fs');

// Parse CSV with proper quote handling
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',');
  const records = [];
  
  for (let i = 1; i < lines.length; i++) {
    // Handle quoted values with commas
    const matches = lines[i].match(/(".*?"|[^,]+)/g) || [];
    const values = matches.map(v => v.replace(/^"|"$/g, ''));
    
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] || '';
    });
    records.push(record);
  }
  return records;
}

console.log('Comprehensive Waste Analysis Test\n');
console.log('='.repeat(50));

const searchTerms = parseCSV('inputs/google_ads/search_terms_convertmyfile_2025-09-04.csv');
console.log(`✅ Parsed ${searchTerms.length} search terms\n`);

let totalWaste = 0;
const wasteTerms = [];

// Analyze all terms
for (const term of searchTerms) {
  const cost = parseFloat(term.Cost.replace(/[$,]/g, ''));
  const conversions = parseFloat(term.Conversions);
  
  // Count ALL waste (zero conversion terms)
  if (conversions === 0 && cost > 0) {
    totalWaste += cost;
    wasteTerms.push({
      term: term['Search term'],
      cost: cost,
      clicks: parseInt(term.Clicks),
      adGroup: term['Ad group']
    });
  }
}

// Sort by cost
wasteTerms.sort((a, b) => b.cost - a.cost);

console.log('WASTE ANALYSIS RESULTS:');
console.log('-'.repeat(50));
console.log(`Total Wasted Spend: $${totalWaste.toFixed(2)}`);
console.log(`Zero-Conversion Terms: ${wasteTerms.length}`);
console.log(`\nv1.2 Success Criteria: ${totalWaste >= 100 ? '✅ PASSED' : '❌ FAILED'} (≥$100 requirement)`);

console.log('\nTop 10 Waste Terms:');
console.log('-'.repeat(50));
wasteTerms.slice(0, 10).forEach((term, i) => {
  console.log(`${i + 1}. ${term.term.padEnd(40)} $${term.cost.toFixed(2)}`);
});

console.log('\nWaste by Ad Group:');
console.log('-'.repeat(50));
const byAdGroup = {};
wasteTerms.forEach(term => {
  if (!byAdGroup[term.adGroup]) {
    byAdGroup[term.adGroup] = { count: 0, total: 0 };
  }
  byAdGroup[term.adGroup].count++;
  byAdGroup[term.adGroup].total += term.cost;
});

Object.entries(byAdGroup).forEach(([group, data]) => {
  console.log(`${group}: ${data.count} terms, $${data.total.toFixed(2)} wasted`);
});

console.log('\nRecommended Negative Keywords (High Priority):');
console.log('-'.repeat(50));

// Pattern analysis
const patterns = {};
wasteTerms.forEach(term => {
  const words = term.term.toLowerCase().split(/\s+/);
  words.forEach(word => {
    if (word.length > 3) {
      patterns[word] = (patterns[word] || 0) + term.cost;
    }
  });
});

// Find high-impact patterns
const sortedPatterns = Object.entries(patterns)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

sortedPatterns.forEach(([pattern, waste]) => {
  const count = wasteTerms.filter(t => t.term.toLowerCase().includes(pattern)).length;
  if (count >= 2) {
    console.log(`- "${pattern}" appears in ${count} waste terms ($${waste.toFixed(2)} total)`);
  }
});

console.log('\n✅ Task 1 Analysis Complete!');