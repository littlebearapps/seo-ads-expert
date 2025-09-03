import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { SemanticPlanDiffer, generatePlanDiff, showDiffSummary } from '../../src/utils/diff.js';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

/**
 * Semantic Plan Diffing Integration Tests
 * 
 * Tests the comprehensive plan evolution tracking system including:
 * - Keyword-level changes (added/removed/score changes/volume updates)
 * - Ad group changes (new/modified/landing page updates) 
 * - SERP intelligence tracking
 * - Asset changes (sitelinks/callouts/structured snippets)
 * - Change impact scoring and insights generation
 */

describe('Semantic Plan Diffing System', () => {
  let differ: SemanticPlanDiffer;
  const testOutputDir = join(process.cwd(), 'tests/__temp_diff_test__');
  
  beforeEach(() => {
    differ = new SemanticPlanDiffer();
    
    // Create test directory
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true });
    }
    mkdirSync(testOutputDir, { recursive: true });
  });
  
  afterEach(() => {
    // Clean up test directory
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true });
    }
  });

  test('Detects new keywords and calculates impact correctly', async () => {
    // Create baseline plan
    const baselinePath = join(testOutputDir, 'plans/testproduct/2025-09-01');
    mkdirSync(baselinePath, { recursive: true });
    
    const baselineKeywords = [
      'webp to png,8.5,1200,exact,kwp,WebP Conversion',
      'pdf converter,7.2,800,phrase,gsc,PDF Tools'
    ];
    writeFileSync(join(baselinePath, 'keywords.csv'), 
      'keyword,final_score,volume,recommended_match_type,data_source,cluster\n' +
      baselineKeywords.join('\n')
    );

    writeFileSync(join(baselinePath, 'ads.json'), JSON.stringify({
      ad_groups: [
        { name: 'WebP Conversion', headlines: ['WebP to PNG Chrome Extension'], landing_page: '/webp' }
      ]
    }));

    writeFileSync(join(baselinePath, 'summary.json'), JSON.stringify({
      product: 'testproduct',
      date: '2025-09-01',
      version: 'v1.1'
    }));

    // Create current plan with changes
    const currentPath = join(testOutputDir, 'plans/testproduct/2025-09-02');
    mkdirSync(currentPath, { recursive: true });
    
    const currentKeywords = [
      'webp to png,8.5,1200,exact,kwp,WebP Conversion',
      'pdf converter,8.0,950,phrase,kwp,PDF Tools', // Score improved, volume increased, source upgraded
      'heic to jpg,7.5,600,exact,rapid,Image Conversion' // New keyword
    ];
    writeFileSync(join(currentPath, 'keywords.csv'),
      'keyword,final_score,volume,recommended_match_type,data_source,cluster\n' +
      currentKeywords.join('\n')
    );

    writeFileSync(join(currentPath, 'ads.json'), JSON.stringify({
      ad_groups: [
        { name: 'WebP Conversion', headlines: ['WebP to PNG Chrome Extension'], landing_page: '/webp' },
        { name: 'Image Conversion', headlines: ['HEIC to JPG Converter'], landing_page: '/heic' } // New ad group
      ]
    }));

    writeFileSync(join(currentPath, 'summary.json'), JSON.stringify({
      product: 'testproduct', 
      date: '2025-09-02',
      version: 'v1.1'
    }));

    // Generate diff
    const diff = await differ.generatePlanDiff(currentPath, 'testproduct', '2025-09-02', testOutputDir);

    // Validate keyword changes
    expect(diff.changes.keywords).toHaveLength(3);
    
    const addedKeyword = diff.changes.keywords.find(c => c.type === 'added');
    expect(addedKeyword).toBeDefined();
    expect(addedKeyword?.keyword).toBe('heic to jpg');
    expect(addedKeyword?.impact).toBe('medium');
    expect(addedKeyword?.reason).toContain('New keyword discovered');

    const scoreChange = diff.changes.keywords.find(c => c.type === 'score_changed');
    expect(scoreChange).toBeDefined();
    expect(scoreChange?.keyword).toBe('pdf converter');
    expect(scoreChange?.details.old_value).toBe(7.2);
    expect(scoreChange?.details.new_value).toBe(8.0);

    const sourceChange = diff.changes.keywords.find(c => c.type === 'source_changed');
    expect(sourceChange).toBeDefined();
    expect(sourceChange?.details.old_value).toBe('gsc');
    expect(sourceChange?.details.new_value).toBe('kwp');

    // Validate ad group changes
    expect(diff.changes.ad_groups).toHaveLength(1);
    const newAdGroup = diff.changes.ad_groups[0];
    expect(newAdGroup.type).toBe('new');
    expect(newAdGroup.ad_group).toBe('Image Conversion');
    expect(newAdGroup.impact).toBe('high');
  });

  test('Detects removed keywords and ad groups', async () => {
    // Create baseline with more content
    const baselinePath = join(testOutputDir, 'plans/testproduct/2025-09-01');
    mkdirSync(baselinePath, { recursive: true });
    
    const baselineKeywords = [
      'webp to png,8.5,1200,exact,kwp,WebP Conversion',
      'old keyword,5.0,200,phrase,estimated,Old Group',
      'pdf converter,7.2,800,phrase,gsc,PDF Tools'
    ];
    writeFileSync(join(baselinePath, 'keywords.csv'),
      'keyword,final_score,volume,recommended_match_type,data_source,cluster\n' +
      baselineKeywords.join('\n')
    );

    writeFileSync(join(baselinePath, 'ads.json'), JSON.stringify({
      ad_groups: [
        { name: 'WebP Conversion', headlines: ['WebP to PNG'], landing_page: '/webp' },
        { name: 'Old Group', headlines: ['Old Converter'], landing_page: '/old' }
      ]
    }));

    writeFileSync(join(baselinePath, 'summary.json'), JSON.stringify({
      product: 'testproduct',
      date: '2025-09-01'
    }));

    // Create current plan with removals
    const currentPath = join(testOutputDir, 'plans/testproduct/2025-09-02');
    mkdirSync(currentPath, { recursive: true });
    
    const currentKeywords = [
      'webp to png,8.5,1200,exact,kwp,WebP Conversion',
      'pdf converter,7.2,800,phrase,gsc,PDF Tools'
      // 'old keyword' removed
    ];
    writeFileSync(join(currentPath, 'keywords.csv'),
      'keyword,final_score,volume,recommended_match_type,data_source,cluster\n' +
      currentKeywords.join('\n')
    );

    writeFileSync(join(currentPath, 'ads.json'), JSON.stringify({
      ad_groups: [
        { name: 'WebP Conversion', headlines: ['WebP to PNG'], landing_page: '/webp' }
        // 'Old Group' removed
      ]
    }));

    writeFileSync(join(currentPath, 'summary.json'), JSON.stringify({
      product: 'testproduct',
      date: '2025-09-02'
    }));

    // Generate diff
    const diff = await differ.generatePlanDiff(currentPath, 'testproduct', '2025-09-02', testOutputDir);

    // Validate removals
    const removedKeyword = diff.changes.keywords.find(c => c.type === 'removed');
    expect(removedKeyword).toBeDefined();
    expect(removedKeyword?.keyword).toBe('old keyword');
    expect(removedKeyword?.impact).toBe('low'); // 5.0 score = low impact

    const removedAdGroup = diff.changes.ad_groups.find(c => c.type === 'removed');
    expect(removedAdGroup).toBeDefined();
    expect(removedAdGroup?.ad_group).toBe('Old Group');
    expect(removedAdGroup?.impact).toBe('high');
  });

  test('Generates proper insights and recommendations', async () => {
    // Create baseline
    const baselinePath = join(testOutputDir, 'plans/testproduct/2025-09-01');
    mkdirSync(baselinePath, { recursive: true });
    
    writeFileSync(join(baselinePath, 'keywords.csv'),
      'keyword,final_score,volume,recommended_match_type,data_source,cluster\n' +
      'test keyword,5.0,100,phrase,estimated,Test Group'
    );

    writeFileSync(join(baselinePath, 'ads.json'), JSON.stringify({
      ad_groups: [{ name: 'Test Group', headlines: ['Test'], landing_page: '/test' }]
    }));

    writeFileSync(join(baselinePath, 'summary.json'), JSON.stringify({
      product: 'testproduct',
      date: '2025-09-01'
    }));

    // Create improved current plan
    const currentPath = join(testOutputDir, 'plans/testproduct/2025-09-02');
    mkdirSync(currentPath, { recursive: true });
    
    const currentKeywords = [
      'test keyword,8.5,1200,exact,kwp,Test Group', // Major improvements
      'new keyword 1,9.0,1500,exact,kwp,New Group',
      'new keyword 2,8.0,800,phrase,kwp,New Group'
    ];
    writeFileSync(join(currentPath, 'keywords.csv'),
      'keyword,final_score,volume,recommended_match_type,data_source,cluster\n' +
      currentKeywords.join('\n')
    );

    writeFileSync(join(currentPath, 'ads.json'), JSON.stringify({
      ad_groups: [
        { name: 'Test Group', headlines: ['Test Improved'], landing_page: '/test' },
        { name: 'New Group', headlines: ['New Converter'], landing_page: '/new' }
      ]
    }));

    writeFileSync(join(currentPath, 'summary.json'), JSON.stringify({
      product: 'testproduct',
      date: '2025-09-02'
    }));

    // Generate diff
    const diff = await differ.generatePlanDiff(currentPath, 'testproduct', '2025-09-02', testOutputDir);

    // Validate insights
    expect(diff.insights.key_improvements).toContain('Discovered 2 new keyword opportunities');
    expect(diff.insights.key_improvements).toContain('1 keywords improved in quality score');
    expect(diff.insights.key_improvements).toContain('Created 1 new targeted ad groups');

    expect(diff.insights.recommendations).toContain('Consider phased rollout for new keywords to manage budget impact');
  });

  test('Handles first run gracefully (baseline creation)', async () => {
    // Create current plan (no baseline exists)
    const currentPath = join(testOutputDir, 'plans/testproduct/2025-09-01');
    mkdirSync(currentPath, { recursive: true });
    
    writeFileSync(join(currentPath, 'keywords.csv'),
      'keyword,final_score,volume,recommended_match_type,data_source,cluster\n' +
      'first keyword,8.0,1000,exact,kwp,First Group'
    );

    writeFileSync(join(currentPath, 'summary.json'), JSON.stringify({
      product: 'testproduct',
      date: '2025-09-01'
    }));

    // Generate diff
    const diff = await differ.generatePlanDiff(currentPath, 'testproduct', '2025-09-01', testOutputDir);

    // Validate baseline diff
    expect(diff.comparison.baseline_date).toBe('none');
    expect(diff.summary.total_changes).toBe(0);
    expect(diff.insights.key_improvements).toContain('Baseline marketing plan created');
    expect(diff.insights.recommendations).toContain('Run plan generation again after data changes to see evolution tracking');
  });

  test('Detects asset changes (callouts and structured snippets)', async () => {
    // Create baseline plan
    const baselinePath = join(testOutputDir, 'plans/testproduct/2025-09-01');
    mkdirSync(baselinePath, { recursive: true });
    
    writeFileSync(join(baselinePath, 'keywords.csv'),
      'keyword,final_score,volume,recommended_match_type,data_source,cluster\n' +
      'test keyword,8.0,1000,exact,kwp,Test Group'
    );

    writeFileSync(join(baselinePath, 'ads.json'), JSON.stringify({
      ad_groups: [{ name: 'Test Group', headlines: ['Test'] }],
      callouts: ['Free Tier', 'No Login'],
      structured_snippets: {
        'Features': ['Convert', 'Compress']
      }
    }));

    writeFileSync(join(baselinePath, 'summary.json'), JSON.stringify({
      product: 'testproduct',
      date: '2025-09-01'
    }));

    // Create current plan with asset changes
    const currentPath = join(testOutputDir, 'plans/testproduct/2025-09-02');
    mkdirSync(currentPath, { recursive: true });
    
    writeFileSync(join(currentPath, 'keywords.csv'),
      'keyword,final_score,volume,recommended_match_type,data_source,cluster\n' +
      'test keyword,8.0,1000,exact,kwp,Test Group'
    );

    writeFileSync(join(currentPath, 'ads.json'), JSON.stringify({
      ad_groups: [{ name: 'Test Group', headlines: ['Test'] }],
      callouts: ['Free Tier', 'Privacy-First', 'Fast Processing'], // Added 2, removed 1
      structured_snippets: {
        'Features': ['Convert', 'Compress', 'Optimize'], // Added 1
        'Formats': ['WebP', 'HEIC'] // New category
      }
    }));

    writeFileSync(join(currentPath, 'summary.json'), JSON.stringify({
      product: 'testproduct',
      date: '2025-09-02'
    }));

    // Generate diff
    const diff = await differ.generatePlanDiff(currentPath, 'testproduct', '2025-09-02', testOutputDir);

    // Validate asset changes
    const calloutChange = diff.changes.assets.find(c => c.type === 'callouts_modified');
    expect(calloutChange).toBeDefined();
    expect(calloutChange?.details.added).toContain('Privacy-First');
    expect(calloutChange?.details.added).toContain('Fast Processing');
    expect(calloutChange?.details.removed).toContain('No Login');

    const snippetChange = diff.changes.assets.find(c => c.type === 'structured_snippets_changed');
    expect(snippetChange).toBeDefined();
  });

  test('Console diff output is properly formatted', async () => {
    // Create simple diff data
    const diff = {
      timestamp: '2025-09-03T10:00:00.000Z',
      product: 'testproduct',
      comparison: {
        baseline_date: '2025-09-01',
        current_date: '2025-09-02',
        current_version: 'v1.1'
      },
      summary: {
        total_changes: 3,
        high_impact_changes: 1,
        medium_impact_changes: 1,
        low_impact_changes: 1,
        change_categories: {
          keywords: 2,
          ad_groups: 1,
          content: 0,
          serp_intelligence: 0,
          assets: 0
        }
      },
      changes: {
        keywords: [
          {
            type: 'added',
            keyword: 'new keyword',
            impact: 'high',
            reason: 'High-value opportunity discovered'
          }
        ],
        ad_groups: [
          {
            type: 'new',
            ad_group: 'New Group',
            impact: 'medium',
            reason: 'Targeted expansion'
          }
        ],
        content: [],
        serp_intelligence: [],
        assets: []
      },
      insights: {
        key_improvements: ['New keyword opportunities'],
        potential_issues: [],
        recommendations: ['Review changes carefully']
      }
    };

    const consoleOutput = differ.generateConsoleDiff(diff as any);
    
    expect(consoleOutput).toContain('📊 Plan Evolution Summary');
    expect(consoleOutput).toContain('📈 Total Changes: 3');
    expect(consoleOutput).toContain('🔴 High Impact: 1');
    expect(consoleOutput).toContain('🟡 Medium Impact: 1');
    expect(consoleOutput).toContain('🟢 Low Impact: 1');
    expect(consoleOutput).toContain('🔤 Keywords: 2 changes');
    expect(consoleOutput).toContain('📂 Ad Groups: 1 changes');
    expect(consoleOutput).toContain('✅ Key Improvements:');
    expect(consoleOutput).toContain('💡 Recommendations:');
  });

  test('generatePlanDiff helper function works correctly', async () => {
    // Create a simple current plan
    const currentPath = join(testOutputDir, 'plans/testproduct/2025-09-01');
    mkdirSync(currentPath, { recursive: true });
    
    writeFileSync(join(currentPath, 'keywords.csv'),
      'keyword,final_score,volume,recommended_match_type,data_source,cluster\n' +
      'test keyword,8.0,1000,exact,kwp,Test Group'
    );

    writeFileSync(join(currentPath, 'summary.json'), JSON.stringify({
      product: 'testproduct',
      date: '2025-09-01',
      version: 'v1.1'
    }));

    // Generate diff using helper function
    const consoleDiff = await generatePlanDiff(currentPath, 'testproduct', '2025-09-01', testOutputDir);

    // Validate helper function
    expect(consoleDiff).toContain('Plan Evolution Summary');
    expect(consoleDiff).toContain('First run - baseline created');
    
    // Verify diff.json was created
    const diffJsonPath = join(currentPath, 'diff.json');
    expect(existsSync(diffJsonPath)).toBe(true);
  });
});