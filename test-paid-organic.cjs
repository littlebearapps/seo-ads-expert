// Test for Paid & Organic Gap Analysis
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

console.log('Paid & Organic Gap Analysis Test\n');
console.log('='.repeat(60));

const data = parseCSV('inputs/google_ads/paid_organic_convertmyfile_2025-09-04.csv');
console.log(`✅ Parsed ${data.length} queries\n`);

// Initialize analysis categories
const protectWinners = [];
const harvestOpportunities = [];
const doubleDown = [];
const seoOpportunities = [];

// Analyze each query
for (const row of data) {
  const organicClicks = parseInt(row['Clicks - organic']) || 0;
  const paidClicks = parseInt(row['Clicks - paid']) || 0;
  const organicPosition = parseFloat(row['Average position - organic']) || 0;
  const cost = parseFloat(row['Cost'].replace(/[$,]/g, ''));
  const paidCtr = parseFloat(row['CTR - paid'].replace(/%/g, ''));
  const organicCtr = parseFloat(row['CTR - organic'].replace(/%/g, ''));
  const conversions = parseFloat(row['Conversions - paid']) || 0;
  const convValue = parseFloat(row['Conv. value - paid']?.replace(/[$,]/g, '')) || 0;

  // Protect Winners: Good organic (pos 1-3) + high paid spend
  if (organicPosition > 0 && organicPosition <= 3 && cost >= 100) {
    const organicShare = organicClicks / (organicClicks + paidClicks);
    const potentialSavings = cost * Math.min(organicShare, 0.5);
    
    protectWinners.push({
      query: row.Query.replace(/^"|"$/g, ''),
      organicPosition,
      organicClicks,
      paidSpend: cost,
      potentialSavings,
      organicShare: (organicShare * 100).toFixed(0)
    });
  }

  // Harvest Opportunities: No/low organic + good paid performance
  if (organicPosition === 0 && paidCtr >= 3 && cost >= 50) {
    const roi = convValue > 0 ? ((convValue - cost) / cost * 100).toFixed(0) : 0;
    harvestOpportunities.push({
      query: row.Query.replace(/^"|"$/g, ''),
      paidSpend: cost,
      paidClicks,
      paidCtr,
      conversions,
      roi,
      estimatedAnnualValue: cost * 365 * 0.3 // 30% potential capture via SEO
    });
  }

  // Double Down: Both channels performing well
  if (organicPosition > 0 && organicPosition <= 3 && paidCtr >= 4 && organicCtr >= 5) {
    doubleDown.push({
      query: row.Query.replace(/^"|"$/g, ''),
      organicPosition,
      organicCtr,
      paidCtr,
      totalValue: cost + (organicClicks * (cost / paidClicks))
    });
  }

  // SEO Opportunities: High paid spend with no organic
  if (organicPosition === 0 && cost >= 100) {
    seoOpportunities.push({
      query: row.Query.replace(/^"|"$/g, ''),
      paidSpend: cost,
      monthlyPotential: cost * 30 * 0.3 // 30% potential via SEO
    });
  }
}

// Sort by impact
protectWinners.sort((a, b) => b.potentialSavings - a.potentialSavings);
harvestOpportunities.sort((a, b) => b.estimatedAnnualValue - a.estimatedAnnualValue);
seoOpportunities.sort((a, b) => b.monthlyPotential - a.monthlyPotential);

// Calculate totals
const totalMonthlySavings = protectWinners.reduce((sum, w) => sum + w.potentialSavings * 30, 0);
const totalSeoValue = harvestOpportunities.reduce((sum, h) => sum + h.estimatedAnnualValue, 0);

console.log('GAP ANALYSIS RESULTS:');
console.log('-'.repeat(60));
console.log(`Protect Winners: ${protectWinners.length} queries`);
console.log(`Harvest Opportunities: ${harvestOpportunities.length} queries`);
console.log(`Double Down Targets: ${doubleDown.length} queries`);
console.log(`SEO Opportunities: ${seoOpportunities.length} queries`);
console.log(`\nPotential Monthly Savings: $${totalMonthlySavings.toFixed(2)}`);
console.log(`SEO Opportunity Value: $${totalSeoValue.toFixed(2)}/year`);

// Check v1.2 success criteria (20-30% efficiency gain)
const totalPaidSpend = data.reduce((sum, row) => {
  return sum + parseFloat(row['Cost'].replace(/[$,]/g, ''));
}, 0);
const efficiencyGain = (totalMonthlySavings / (totalPaidSpend * 30)) * 100;

console.log(`\nv1.2 Success Criteria: ${efficiencyGain >= 20 ? '✅ PASSED' : '❌ FAILED'}`);
console.log(`Efficiency Gain: ${efficiencyGain.toFixed(1)}% (target: 20-30%)`);

// Show top protect winners
console.log('\n🛡️ TOP PROTECT WINNERS (Reduce Paid Spend):');
console.log('-'.repeat(60));
protectWinners.slice(0, 5).forEach((winner, i) => {
  console.log(`${i + 1}. "${winner.query}"`);
  console.log(`   Organic #${winner.organicPosition}, capturing ${winner.organicShare}% of clicks`);
  console.log(`   Current: $${winner.paidSpend.toFixed(2)}/day`);
  console.log(`   Save: $${winner.potentialSavings.toFixed(2)}/day`);
});

// Show top harvest opportunities  
console.log('\n🌱 TOP HARVEST OPPORTUNITIES (Create SEO Content):');
console.log('-'.repeat(60));
harvestOpportunities.slice(0, 5).forEach((opp, i) => {
  console.log(`${i + 1}. "${opp.query}"`);
  console.log(`   Paid: $${opp.paidSpend.toFixed(2)}/day, CTR: ${opp.paidCtr}%`);
  console.log(`   ROI: ${opp.roi}%, Conversions: ${opp.conversions}`);
  console.log(`   SEO Value: $${opp.estimatedAnnualValue.toFixed(2)}/year`);
});

// Show double down targets
if (doubleDown.length > 0) {
  console.log('\n🚀 DOUBLE DOWN TARGETS (Increase Investment):');
  console.log('-'.repeat(60));
  doubleDown.slice(0, 3).forEach((target, i) => {
    console.log(`${i + 1}. "${target.query}"`);
    console.log(`   Organic #${target.organicPosition} @ ${target.organicCtr}% CTR`);
    console.log(`   Paid @ ${target.paidCtr}% CTR`);
    console.log(`   Combined Value: $${target.totalValue.toFixed(2)}/day`);
  });
}

// Generate report file
const outputDir = 'plans/convertmyfile/2025-09-04/intelligence';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Create simple report
const report = [
  '## Paid & Organic Optimization Strategy\n',
  `### Summary`,
  `- Protect Winners: ${protectWinners.length} queries`,
  `- Monthly Savings Potential: $${totalMonthlySavings.toFixed(2)}`,
  `- SEO Opportunities: $${totalSeoValue.toFixed(2)}/year`,
  `- Efficiency Gain: ${efficiencyGain.toFixed(1)}%\n`,
  '### Top Actions',
  ...protectWinners.slice(0, 3).map(w => 
    `1. Reduce bids on "${w.query}" - Save $${(w.potentialSavings * 30).toFixed(2)}/month`
  ),
  ...harvestOpportunities.slice(0, 3).map(h => 
    `2. Create content for "${h.query}" - Worth $${h.estimatedAnnualValue.toFixed(2)}/year`
  )
].join('\n');

fs.writeFileSync(`${outputDir}/paid_organic_analysis.md`, report);
console.log(`\n✅ Report saved to ${outputDir}/paid_organic_analysis.md`);

console.log('\n✅ Task 2 Analysis Complete!');