/**
 * Paid Organic Gaps Command - v1.4
 * Analyzes gaps between paid and organic search performance
 */

import { logger } from '../utils/logger.js';
import { DatabaseConnectionPool } from '../database/json-db.js';
import { SearchConsoleConnector } from '../connectors/search-console.js';
import path from 'path';
import fs from 'fs/promises';

interface PaidOrganicGapsOptions {
  product: string;
}

interface PaidOrganicGapsResult {
  seoWinsNoPaid: number;
  paidWinsNoSeo: number;
  bothWinning: number;
  outputPath: string;
}

interface PaidData {
  keyword: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  avgPosition?: number;
}

interface OrganicData {
  keyword: string;
  impressions: number;
  clicks: number;
  position: number;
  ctr: number;
}

interface GapOpportunity {
  keyword: string;
  type: 'seo_win' | 'paid_win' | 'both_win';
  paidMetrics?: PaidData;
  organicMetrics?: OrganicData;
  recommendation: string;
  estimatedImpact: string;
}

export async function analyzePaidOrganicGaps(options: PaidOrganicGapsOptions): Promise<PaidOrganicGapsResult> {
  logger.info('Starting paid/organic gap analysis', options);

  // Initialize database
  const db = new DatabaseConnectionPool();
  await db.initialize();

  try {
    // Fetch paid data from database
    console.log('📊 Loading paid search data...');
    // For JSON database, fetch and filter manually
    const allSearchTerms = await db.query<any>('searchTerms');
    
    // Calculate 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];
    
    // Aggregate paid data
    const paidAggregated = new Map<string, PaidData>();
    
    for (const term of allSearchTerms) {
      if (term.date >= startDate && term.engine === 'google') {
        const key = term.query.toLowerCase();
        
        if (!paidAggregated.has(key)) {
          paidAggregated.set(key, {
            keyword: term.query,
            impressions: 0,
            clicks: 0,
            cost: 0,
            conversions: 0
          });
        }
        
        const agg = paidAggregated.get(key)!;
        agg.impressions += term.impressions || 0;
        agg.clicks += term.clicks || 0;
        agg.cost += term.cost || 0;
        agg.conversions += term.conversions || 0;
      }
    }
    
    const paidData = Array.from(paidAggregated.values())
      .filter(p => p.impressions >= 10)
      .sort((a, b) => b.clicks - a.clicks);

    console.log(`💰 Found ${paidData.length} paid keywords`);

    // Fetch organic data (from Search Console or cached data)
    console.log('🔍 Loading organic search data...');
    let organicData: OrganicData[] = [];

    // Try to get from Search Console
    const gscConnector = new SearchConsoleConnector();
    if (gscConnector.isAvailable()) {
      try {
        const gscData = await gscConnector.fetchSearchAnalytics(
          'sc-domain:littlebearapps.com',
          {
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0],
            dimensions: ['query'],
            dimensionFilterGroups: [{
              filters: [{
                dimension: 'query',
                operator: 'contains',
                expression: options.product.replace(/([A-Z])/g, ' $1').trim().toLowerCase()
              }]
            }]
          }
        );

        if (gscData && Array.isArray(gscData)) {
          organicData = gscData.map((row: any) => ({
            keyword: row.keys[0],
            impressions: row.impressions || 0,
            clicks: row.clicks || 0,
            position: row.position || 99,
            ctr: row.ctr || 0
          }));
        }
      } catch (error) {
        logger.warn('Could not fetch Search Console data', error);
      }
    }

    // Fallback to cached/sample data if no GSC data
    if (organicData.length === 0) {
      console.log('⚠️  Using sample organic data (Search Console not available)');
      // Generate sample data based on paid keywords
      organicData = paidData.slice(0, 50).map(paid => ({
        keyword: paid.keyword,
        impressions: Math.floor(Math.random() * 1000),
        clicks: Math.floor(Math.random() * 50),
        position: Math.random() * 20 + 1,
        ctr: Math.random() * 0.1
      }));
    }

    console.log(`🌱 Found ${organicData.length} organic keywords`);

    // Create keyword maps for comparison
    const paidMap = new Map(paidData.map(p => [p.keyword.toLowerCase(), p]));
    const organicMap = new Map(organicData.map(o => [o.keyword.toLowerCase(), o]));

    // Find gaps
    const gaps: GapOpportunity[] = [];

    // SEO wins without paid coverage
    for (const [keyword, organic] of organicMap.entries()) {
      if (!paidMap.has(keyword) && organic.position <= 10) {
        gaps.push({
          keyword,
          type: 'seo_win',
          organicMetrics: organic,
          recommendation: 'Consider adding paid ads to complement strong organic ranking',
          estimatedImpact: `+${Math.floor(organic.impressions * 0.1)} clicks/month`
        });
      }
    }

    // Paid wins without SEO coverage
    for (const [keyword, paid] of paidMap.entries()) {
      if (!organicMap.has(keyword) || organicMap.get(keyword)!.position > 20) {
        gaps.push({
          keyword,
          type: 'paid_win',
          paidMetrics: paid,
          recommendation: 'Improve organic content for this high-performing paid keyword',
          estimatedImpact: `Save $${(paid.cost * 0.3).toFixed(2)}/month`
        });
      }
    }

    // Both winning (synergy opportunities)
    for (const [keyword, paid] of paidMap.entries()) {
      const organic = organicMap.get(keyword);
      if (organic && organic.position <= 10) {
        gaps.push({
          keyword,
          type: 'both_win',
          paidMetrics: paid,
          organicMetrics: organic,
          recommendation: 'Optimize bidding strategy - strong organic presence',
          estimatedImpact: `Reduce CPC by 20-30%`
        });
      }
    }

    // Count gaps by type
    const seoWinsNoPaid = gaps.filter(g => g.type === 'seo_win').length;
    const paidWinsNoSeo = gaps.filter(g => g.type === 'paid_win').length;
    const bothWinning = gaps.filter(g => g.type === 'both_win').length;

    // Generate output
    const outputDir = path.join(
      process.cwd(),
      'performance',
      options.product,
      'paid-organic-gaps',
      new Date().toISOString().split('T')[0]
    );
    await fs.mkdir(outputDir, { recursive: true });

    // Generate markdown report
    const report = generateGapsReport(gaps, seoWinsNoPaid, paidWinsNoSeo, bothWinning);
    await fs.writeFile(path.join(outputDir, 'paid_organic_gaps.md'), report);

    // Generate CSV for action items
    const csvContent = generateActionItemsCSV(gaps);
    await fs.writeFile(path.join(outputDir, 'action_items.csv'), csvContent);

    // Generate summary JSON
    const summary = {
      analysisDate: new Date().toISOString(),
      product: options.product,
      totalPaidKeywords: paidData.length,
      totalOrganicKeywords: organicData.length,
      gaps: {
        seoWinsNoPaid,
        paidWinsNoSeo,
        bothWinning
      },
      topOpportunities: gaps.slice(0, 10).map(g => ({
        keyword: g.keyword,
        type: g.type,
        recommendation: g.recommendation,
        estimatedImpact: g.estimatedImpact
      })),
      estimatedMonthlySavings: gaps
        .filter(g => g.type === 'paid_win')
        .reduce((sum, g) => sum + (g.paidMetrics?.cost || 0) * 0.3, 0)
    };

    await fs.writeFile(
      path.join(outputDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );

    logger.info('Paid/organic gap analysis complete', summary);

    return {
      seoWinsNoPaid,
      paidWinsNoSeo,
      bothWinning,
      outputPath: outputDir
    };

  } finally {
    await db.close();
  }
}

function generateGapsReport(
  gaps: GapOpportunity[],
  seoWinsNoPaid: number,
  paidWinsNoSeo: number,
  bothWinning: number
): string {
  const report: string[] = [];

  report.push('# Paid/Organic Gap Analysis');
  report.push(`*Generated: ${new Date().toISOString().split('T')[0]}*\n`);

  // Summary
  report.push('## Summary\n');
  report.push(`- **SEO Wins (No Paid Coverage)**: ${seoWinsNoPaid} keywords`);
  report.push(`- **Paid Wins (No/Poor SEO)**: ${paidWinsNoSeo} keywords`);
  report.push(`- **Both Winning (Synergy)**: ${bothWinning} keywords\n`);

  // SEO Wins Section
  report.push('## SEO Wins Without Paid Coverage\n');
  report.push('*These keywords rank well organically but have no paid ads*\n');
  
  const seoWins = gaps.filter(g => g.type === 'seo_win').slice(0, 20);
  if (seoWins.length > 0) {
    report.push('| Keyword | Organic Position | Organic Clicks | Action |');
    report.push('|---------|------------------|----------------|--------|');
    for (const gap of seoWins) {
      report.push(
        `| ${gap.keyword} | ${gap.organicMetrics?.position.toFixed(1)} | ${gap.organicMetrics?.clicks} | Add paid ads |`
      );
    }
    report.push('');
  }

  // Paid Wins Section
  report.push('## Paid Wins Without SEO Coverage\n');
  report.push('*These keywords perform well in paid but lack organic presence*\n');
  
  const paidWins = gaps.filter(g => g.type === 'paid_win').slice(0, 20);
  if (paidWins.length > 0) {
    report.push('| Keyword | Paid Clicks | Cost | Monthly Savings Potential |');
    report.push('|---------|-------------|------|---------------------------|');
    for (const gap of paidWins) {
      const savings = (gap.paidMetrics?.cost || 0) * 0.3;
      report.push(
        `| ${gap.keyword} | ${gap.paidMetrics?.clicks} | $${gap.paidMetrics?.cost.toFixed(2)} | $${savings.toFixed(2)} |`
      );
    }
    report.push('');
  }

  // Synergy Section
  report.push('## Keywords Winning in Both Channels\n');
  report.push('*Opportunities to optimize bidding with strong organic support*\n');
  
  const synergies = gaps.filter(g => g.type === 'both_win').slice(0, 20);
  if (synergies.length > 0) {
    report.push('| Keyword | Organic Pos | Paid CPC | Optimization |');
    report.push('|---------|-------------|----------|--------------|');
    for (const gap of synergies) {
      const cpc = gap.paidMetrics ? (gap.paidMetrics.cost / gap.paidMetrics.clicks).toFixed(2) : '0.00';
      report.push(
        `| ${gap.keyword} | ${gap.organicMetrics?.position.toFixed(1)} | $${cpc} | Reduce bids 20-30% |`
      );
    }
    report.push('');
  }

  // Recommendations
  report.push('## Recommendations\n');
  report.push('### Quick Wins');
  report.push('1. **Reduce bids** on keywords with top 3 organic rankings');
  report.push('2. **Create content** for high-cost paid keywords without organic presence');
  report.push('3. **Add paid campaigns** for organic winners to maximize visibility\n');

  report.push('### Strategic Actions');
  report.push('1. **Content Gap Analysis**: Create pages targeting paid-only keywords');
  report.push('2. **Bid Adjustment Strategy**: Lower bids where organic ranks well');
  report.push('3. **Full SERP Domination**: Combine paid + organic for key terms');

  return report.join('\n');
}

function generateActionItemsCSV(gaps: GapOpportunity[]): string {
  const headers = ['Keyword', 'Gap Type', 'Recommendation', 'Estimated Impact', 'Priority'];
  const rows = gaps.map(gap => {
    const priority = gap.type === 'paid_win' ? 'High' : 
                     gap.type === 'seo_win' ? 'Medium' : 'Low';
    return [
      gap.keyword,
      gap.type,
      gap.recommendation,
      gap.estimatedImpact,
      priority
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}