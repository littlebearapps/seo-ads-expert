import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { stringify } from 'csv-stringify';
import pino from 'pino';
import { KeywordData, AdGroup, PlanSummary } from './connectors/types.js';
import { KeywordCluster } from './clustering.js';
import { format } from 'date-fns';
import { 
  fixDecimals, 
  fixObjectDecimals, 
  sortKeywords, 
  sortCampaignHierarchy,
  formatJsonDeterministic,
  writeJsonFile,
  writeMarkdownFile,
  formatMarkdownDeterministic 
} from './utils/deterministic.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export interface WriterOptions {
  outputPath: string;
  productName: string;
  date: string;
  markets: string[];
}

export interface OutputFiles {
  keywordsCsv: string;
  adsJson: string;
  seoPagesMarkdown: string;
  competitorsMarkdown: string;
  negativesText: string;
  summaryJson: string;
}

export class OutputWriterEngine {
  
  /**
   * Writes keywords data to CSV format with enhanced columns
   * Includes data source tracking and recommended match types
   */
  async writeKeywordsCsv(
    keywords: KeywordData[], 
    options: WriterOptions
  ): Promise<string> {
    const outputDir = join(options.outputPath, options.productName, options.date);
    const csvPath = join(outputDir, 'keywords.csv');

    // Ensure output directory exists
    this.ensureDirectoryExists(outputDir);

    logger.info(`📊 Writing ${keywords.length} keywords to CSV: ${csvPath}`);

    // Sort keywords deterministically: score desc → alphabetically → market
    const sortedKeywords = sortKeywords([...keywords]);
    
    // Prepare CSV data with enhanced columns and fixed decimals
    const csvData = sortedKeywords.map(keyword => ({
      keyword: keyword.keyword,
      cluster: keyword.cluster || '',
      volume: keyword.volume || '',
      cpc: keyword.cpc ? `$${fixDecimals(keyword.cpc)}` : '',
      competition: keyword.competition ? fixDecimals(keyword.competition) : '',
      intent_score: fixDecimals(keyword.intent_score),
      final_score: fixDecimals(keyword.final_score, 3),
      data_source: keyword.data_source.toUpperCase(),
      recommended_match_type: keyword.recommended_match_type,
      markets: keyword.markets.join(';'),
      serp_features: keyword.serp_features.join(';')
    }));

    // Write CSV with headers
    return new Promise((resolve, reject) => {
      stringify(csvData, {
        header: true,
        columns: {
          keyword: 'Keyword',
          cluster: 'Cluster',
          volume: 'Volume',
          cpc: 'CPC',
          competition: 'Competition',
          intent_score: 'Intent Score',
          final_score: 'Final Score',
          data_source: 'Data Source',
          recommended_match_type: 'Match Type',
          markets: 'Markets',
          serp_features: 'SERP Features'
        }
      }, (err, output) => {
        if (err) {
          logger.error('❌ Failed to generate keywords CSV:', err);
          reject(err);
          return;
        }

        try {
          writeFileSync(csvPath, output, 'utf8');
          logger.info(`✅ Keywords CSV written successfully: ${csvPath}`);
          resolve(csvPath);
        } catch (writeErr) {
          logger.error('❌ Failed to write keywords CSV file:', writeErr);
          reject(writeErr);
        }
      });
    });
  }

  /**
   * Writes ad groups data to JSON format with comprehensive structure
   * Includes headlines, descriptions, sitelinks, and negative keywords
   */
  async writeAdsJson(
    clusters: KeywordCluster[],
    productConfig: any,
    options: WriterOptions
  ): Promise<string> {
    const outputDir = join(options.outputPath, options.productName, options.date);
    const jsonPath = join(outputDir, 'ads.json');

    this.ensureDirectoryExists(outputDir);

    logger.info(`📱 Generating ad groups from ${clusters.length} clusters: ${jsonPath}`);

    const adGroups: AdGroup[] = [];

    for (const cluster of clusters) {
      const adGroup = this.generateAdGroupFromCluster(cluster, productConfig);
      adGroups.push(adGroup);
    }

    const adsData = {
      version: "1.1.0",
      product: options.productName,
      date: options.date,
      markets: options.markets.sort(), // Sort for deterministic output
      total_ad_groups: adGroups.length,
      generated_at: new Date().toISOString(),
      ad_groups: adGroups
    };

    // Apply deterministic formatting (fix decimals, sort arrays)
    const processedAdsData = sortCampaignHierarchy(fixObjectDecimals(adsData));

    try {
      writeJsonFile(jsonPath, processedAdsData);
      
      logger.info(`✅ Ads JSON written successfully: ${jsonPath}`);
      logger.info(`📊 Generated ${adGroups.length} ad groups from clusters`);
      
      return jsonPath;
    } catch (error) {
      logger.error('❌ Failed to write ads JSON file:', error);
      throw error;
    }
  }

  /**
   * Writes SEO pages markdown with landing page briefs and mapping
   */
  async writeSeoPagesMarkdown(
    clusters: KeywordCluster[],
    productConfig: any,
    options: WriterOptions
  ): Promise<string> {
    const outputDir = join(options.outputPath, options.productName, options.date);
    const markdownPath = join(outputDir, 'seo_pages.md');

    this.ensureDirectoryExists(outputDir);

    logger.info(`📄 Generating SEO pages markdown: ${markdownPath}`);

    let markdown = this.generateSeoMarkdownHeader(options);
    
    // Current page mapping section
    markdown += this.generateCurrentPageMapping(clusters, productConfig);
    
    // Landing page gaps section
    markdown += this.generateLandingPageGaps(clusters);
    
    // Auto-generated page briefs
    markdown += this.generatePageBriefs(clusters, productConfig);

    try {
      writeMarkdownFile(markdownPath, markdown);
      logger.info(`✅ SEO pages markdown written successfully: ${markdownPath}`);
      return markdownPath;
    } catch (error) {
      logger.error('❌ Failed to write SEO pages markdown:', error);
      throw error;
    }
  }

  /**
   * Writes competitors analysis markdown
   */
  async writeCompetitorsMarkdown(
    competitorData: Map<string, number>,
    clusters: KeywordCluster[],
    options: WriterOptions
  ): Promise<string> {
    const outputDir = join(options.outputPath, options.productName, options.date);
    const markdownPath = join(outputDir, 'competitors.md');

    this.ensureDirectoryExists(outputDir);

    logger.info(`🏆 Generating competitors analysis: ${markdownPath}`);

    let markdown = `# Competitor Analysis - ${options.productName}\n\n`;
    markdown += `**Generated:** ${new Date().toISOString().split('T')[0]}  \n`;
    markdown += `**Markets:** ${options.markets.join(', ')}  \n\n`;

    // Top competitors by frequency
    const sortedCompetitors = Array.from(competitorData.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    markdown += `## Top Competitors by SERP Presence\n\n`;
    markdown += `| Rank | Domain | Appearances | Market Share |\n`;
    markdown += `|------|--------|-------------|---------------|\n`;

    const totalAppearances = Array.from(competitorData.values()).reduce((sum, count) => sum + count, 0);

    sortedCompetitors.forEach(([domain, count], index) => {
      const marketShare = ((count / totalAppearances) * 100).toFixed(1);
      markdown += `| ${index + 1} | ${domain} | ${count} | ${marketShare}% |\n`;
    });

    // Competitor analysis by cluster
    markdown += `\n## Competitor Analysis by Use Case\n\n`;
    
    for (const cluster of clusters.slice(0, 10)) { // Top 10 clusters
      if (cluster.keywords.length > 0) {
        markdown += `### ${cluster.name}\n\n`;
        
        // Get unique competitors for this cluster (from SERP features if available)
        const clusterCompetitors = this.extractCompetitorsFromCluster(cluster, competitorData);
        
        if (clusterCompetitors.length > 0) {
          markdown += `**Key Competitors:**\n`;
          clusterCompetitors.slice(0, 5).forEach(([domain, appearances]) => {
            markdown += `- ${domain} (${appearances} appearances)\n`;
          });
        }
        
        markdown += `\n**Content Angles:**\n`;
        markdown += `- Target keywords: ${cluster.primaryKeywords.slice(0, 3).map(k => k.keyword).join(', ')}\n`;
        markdown += `- Landing page: ${cluster.landingPage || 'Opportunity for new page'}\n\n`;
      }
    }

    try {
      writeMarkdownFile(markdownPath, markdown);
      logger.info(`✅ Competitors markdown written successfully: ${markdownPath}`);
      return markdownPath;
    } catch (error) {
      logger.error('❌ Failed to write competitors markdown:', error);
      throw error;
    }
  }

  /**
   * Writes negative keywords text file with pre-seeded and derived negatives
   */
  async writeNegativesText(
    productConfig: any,
    clusters: KeywordCluster[],
    options: WriterOptions
  ): Promise<string> {
    const outputDir = join(options.outputPath, options.productName, options.date);
    const textPath = join(outputDir, 'negatives.txt');

    this.ensureDirectoryExists(outputDir);

    logger.info(`🚫 Generating negative keywords file: ${textPath}`);

    let negativesList = '';
    
    // Header
    negativesList += `# Negative Keywords - ${options.productName}\n`;
    negativesList += `# Generated: ${new Date().toISOString().split('T')[0]}\n`;
    negativesList += `# Markets: ${options.markets.join(', ')}\n\n`;

    // Pre-seeded negatives from product config
    negativesList += `## Pre-seeded Negatives (Product-Specific)\n`;
    negativesList += `# These negatives are configured specifically for ${options.productName}\n\n`;
    
    productConfig.pre_seeded_negatives.forEach((negative: string) => {
      negativesList += `${negative}\n`;
    });

    // Universal browser extension negatives
    negativesList += `\n## Universal Browser Extension Negatives\n`;
    negativesList += `# These apply to most Chrome extension campaigns\n\n`;
    
    const universalNegatives = [
      'firefox',
      'safari',
      'edge',
      'mobile',
      'android',
      'ios',
      'iphone',
      'ipad',
      'mac',
      'windows',
      'linux',
      'download',
      'install',
      'tutorial',
      'how to',
      'course',
      'training',
      'jobs',
      'career',
      'salary',
      'api',
      'developer',
      'code',
      'programming'
    ];

    universalNegatives.forEach(negative => {
      negativesList += `${negative}\n`;
    });

    // SERP-derived negatives (from competitor analysis)
    negativesList += `\n## SERP-Derived Negatives\n`;
    negativesList += `# These negatives are derived from competitor analysis\n\n`;
    
    const serpNegatives = this.extractSerpDerivedNegatives(clusters);
    serpNegatives.forEach(negative => {
      negativesList += `${negative}\n`;
    });

    try {
      writeFileSync(textPath, negativesList, 'utf8');
      logger.info(`✅ Negatives text written successfully: ${textPath}`);
      return textPath;
    } catch (error) {
      logger.error('❌ Failed to write negatives text:', error);
      throw error;
    }
  }

  /**
   * Writes comprehensive summary JSON with all plan statistics
   */
  async writeSummaryJson(
    summary: PlanSummary,
    outputPaths: OutputFiles,
    options: WriterOptions
  ): Promise<string> {
    const outputDir = join(options.outputPath, options.productName, options.date);
    const jsonPath = join(outputDir, 'summary.json');

    this.ensureDirectoryExists(outputDir);

    logger.info(`📋 Generating plan summary: ${jsonPath}`);

    const summaryData = {
      ...summary,
      generated_at: new Date().toISOString(),
      output_files: {
        keywords_csv: outputPaths.keywordsCsv,
        ads_json: outputPaths.adsJson,
        seo_pages_md: outputPaths.seoPagesMarkdown,
        competitors_md: outputPaths.competitorsMarkdown,
        negatives_txt: outputPaths.negativesText,
        summary_json: jsonPath
      },
      cli_usage: {
        view_plan: `npx tsx src/cli.ts show --product ${options.productName} --date ${options.date}`,
        list_plans: `npx tsx src/cli.ts list --product ${options.productName}`,
        generate_new: `npx tsx src/cli.ts plan --product ${options.productName} --markets ${options.markets.join(',')}`
      }
    };

    try {
      // Apply deterministic formatting to summary data
      const processedSummaryData = fixObjectDecimals(summaryData);
      writeJsonFile(jsonPath, processedSummaryData);
      
      logger.info(`✅ Summary JSON written successfully: ${jsonPath}`);
      return jsonPath;
    } catch (error) {
      logger.error('❌ Failed to write summary JSON:', error);
      throw error;
    }
  }

  // Helper Methods

  private ensureDirectoryExists(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
      logger.debug(`📁 Created directory: ${dirPath}`);
    }
  }

  private generateAdGroupFromCluster(cluster: KeywordCluster, productConfig: any): AdGroup {
    // Extract keywords by match type
    const exactKeywords = cluster.primaryKeywords
      .filter(k => k.recommended_match_type === 'exact')
      .map(k => k.keyword);
    
    const phraseKeywords = cluster.keywords
      .filter(k => k.recommended_match_type === 'phrase')
      .map(k => k.keyword);
    
    const broadKeywords = cluster.keywords
      .filter(k => k.recommended_match_type === 'broad')
      .map(k => k.keyword);

    // Generate headlines with pinned Chrome Extension requirement
    const headlines = this.generateHeadlines(cluster, productConfig);
    
    // Generate descriptions
    const descriptions = this.generateDescriptions(cluster, productConfig);
    
    // Generate sitelinks
    const sitelinks = this.generateSitelinks(cluster, productConfig);

    // Generate negatives (cluster-specific + product negatives)
    const negatives = this.generateClusterNegatives(cluster, productConfig);

    return {
      name: cluster.name,
      keywords_exact: exactKeywords,
      keywords_phrase: phraseKeywords,
      keywords_broad: broadKeywords,
      headlines: headlines,
      descriptions: descriptions,
      sitelinks: sitelinks,
      landing_page: cluster.landingPage || productConfig.target_pages.find((p: any) => p.purpose === 'main')?.url || '',
      negatives: negatives
    };
  }

  private generateHeadlines(cluster: KeywordCluster, productConfig: any): string[] {
    const headlines = [];
    
    // Pinned headline (required by GPT-5 specifications)
    const pinnedHeadline = `${cluster.name} Chrome Extension`;
    headlines.push(pinnedHeadline);
    
    // Value proposition headlines
    const valueProp1 = this.getValuePropositionForCluster(cluster, productConfig, 0);
    const valueProp2 = this.getValuePropositionForCluster(cluster, productConfig, 1);
    
    headlines.push(valueProp1);
    headlines.push(valueProp2);
    
    return headlines;
  }

  private generateDescriptions(cluster: KeywordCluster, productConfig: any): string[] {
    const descriptions = [];
    
    // Primary description with value proposition
    const primaryDesc = this.generatePrimaryDescription(cluster, productConfig);
    descriptions.push(primaryDesc);
    
    // Secondary description with features
    const secondaryDesc = this.generateSecondaryDescription(cluster, productConfig);
    descriptions.push(secondaryDesc);
    
    return descriptions;
  }

  private generateSitelinks(cluster: KeywordCluster, productConfig: any): string[] {
    // Standard sitelinks for Chrome extensions
    const standardSitelinks = ['Features', 'Privacy', 'Support', 'Install'];
    
    // Add cluster-specific sitelinks if applicable
    const clusterSitelinks = this.getClusterSpecificSitelinks(cluster, productConfig);
    
    return [...clusterSitelinks, ...standardSitelinks].slice(0, 4);
  }

  private generateClusterNegatives(cluster: KeywordCluster, productConfig: any): string[] {
    const negatives = new Set<string>();
    
    // Add product-level negatives
    productConfig.pre_seeded_negatives.forEach((neg: string) => negatives.add(neg));
    
    // Add cluster-specific negatives based on use case
    const clusterSpecificNegatives = this.getClusterSpecificNegatives(cluster);
    clusterSpecificNegatives.forEach(neg => negatives.add(neg));
    
    return Array.from(negatives).slice(0, 20); // Limit to 20 negatives per ad group
  }

  private getValuePropositionForCluster(cluster: KeywordCluster, productConfig: any, index: number): string {
    const useCase = cluster.useCase;
    const productName = productConfig.product;
    
    // Use case specific value props
    const valuePropsByUseCase: Record<string, string[]> = {
      'webp-to-png': ['Convert WebP to PNG Instantly', 'Free WebP Converter Tool'],
      'heic-to-jpg': ['Convert HEIC to JPG Fast', 'iPhone Photo Converter'],
      'color-picker': ['Advanced Color Picker Tool', 'Professional Color Selection'],
      'note-sync': ['Sync Notes Across Apps', 'Seamless Note Integration'],
    };
    
    const useCaseProps = valuePropsByUseCase[useCase] || productConfig.value_props;
    return useCaseProps[index % useCaseProps.length] || `${productName} - ${cluster.name}`;
  }

  private generatePrimaryDescription(cluster: KeywordCluster, productConfig: any): string {
    const summary = productConfig.summary.slice(0, 80); // Fit in ad description limit
    return `${summary} Fast, free, and secure.`;
  }

  private generateSecondaryDescription(cluster: KeywordCluster, productConfig: any): string {
    const topValueProp = productConfig.value_props[0] || 'Professional browser tool';
    return `${topValueProp}. No registration required. Install now.`;
  }

  private getClusterSpecificSitelinks(cluster: KeywordCluster, productConfig: any): string[] {
    const useCase = cluster.useCase;
    
    const sitelinksByUseCase: Record<string, string[]> = {
      'webp-to-png': ['WebP Guide'],
      'heic-to-jpg': ['HEIC Info'],
      'color-picker': ['Color Tools'],
      'note-sync': ['Integrations'],
    };
    
    return sitelinksByUseCase[useCase] || [];
  }

  private getClusterSpecificNegatives(cluster: KeywordCluster): string[] {
    const useCase = cluster.useCase;
    
    const negativesByUseCase: Record<string, string[]> = {
      'webp-to-png': ['photoshop', 'gimp', 'converter software'],
      'heic-to-jpg': ['iphone app', 'ios app', 'mobile converter'],
      'color-picker': ['design software', 'photoshop plugin'],
      'note-sync': ['note taking app', 'mobile app'],
    };
    
    return negativesByUseCase[useCase] || [];
  }

  private generateSeoMarkdownHeader(options: WriterOptions): string {
    return `# SEO Pages Analysis - ${options.productName}

**Generated:** ${new Date().toISOString().split('T')[0]}  
**Markets:** ${options.markets.join(', ')}  

## Overview

This document provides SEO page mapping analysis and recommendations for ${options.productName} based on keyword clustering and search intent analysis.

`;
  }

  private generateCurrentPageMapping(clusters: KeywordCluster[], productConfig: any): string {
    let markdown = `## Current Page Mapping\n\n`;
    
    const mappedClusters = clusters.filter(c => c.landingPage);
    const unmappedClusters = clusters.filter(c => !c.landingPage);
    
    markdown += `**Mapped Clusters:** ${mappedClusters.length}/${clusters.length}\n`;
    markdown += `**Coverage:** ${((mappedClusters.length / clusters.length) * 100).toFixed(1)}%\n\n`;
    
    if (mappedClusters.length > 0) {
      markdown += `### Successfully Mapped Clusters\n\n`;
      markdown += `| Cluster | Keywords | Volume | Landing Page |\n`;
      markdown += `|---------|----------|--------|--------------|\n`;
      
      mappedClusters.forEach(cluster => {
        const volumeStr = typeof cluster.totalVolume === 'number' ? 
          Math.round(cluster.totalVolume).toLocaleString() : 
          cluster.totalVolume.toString();
        markdown += `| ${cluster.name} | ${cluster.keywords.length} | ${volumeStr} | ${cluster.landingPage} |\n`;
      });
    }
    
    return markdown + '\n';
  }

  private generateLandingPageGaps(clusters: KeywordCluster[]): string {
    const unmappedClusters = clusters.filter(c => !c.landingPage && c.totalVolume > 100);
    
    if (unmappedClusters.length === 0) {
      return `## Landing Page Gaps\n\n✅ All high-volume clusters are mapped to landing pages.\n\n`;
    }
    
    let markdown = `## Landing Page Gaps\n\n`;
    markdown += `⚠️ **${unmappedClusters.length} high-potential clusters need landing pages:**\n\n`;
    
    unmappedClusters.forEach((cluster, index) => {
      const volumeStr = typeof cluster.totalVolume === 'number' ? 
        Math.round(cluster.totalVolume).toLocaleString() : 
        cluster.totalVolume.toString();
      markdown += `### ${index + 1}. ${cluster.name}\n`;
      markdown += `- **Keywords:** ${cluster.keywords.length}\n`;
      markdown += `- **Volume:** ${volumeStr}\n`;
      markdown += `- **Top Keywords:** ${cluster.primaryKeywords.slice(0, 3).map(k => k.keyword).join(', ')}\n`;
      markdown += `- **Suggested URL:** \`${this.generateSuggestedUrl(cluster)}\`\n\n`;
    });
    
    return markdown;
  }

  private generatePageBriefs(clusters: KeywordCluster[], productConfig: any): string {
    const unmappedClusters = clusters.filter(c => !c.landingPage && c.totalVolume > 100);
    
    if (unmappedClusters.length === 0) {
      return '';
    }
    
    let markdown = `## Auto-Generated Landing Page Briefs\n\n`;
    
    unmappedClusters.slice(0, 5).forEach((cluster, index) => { // Limit to top 5
      markdown += this.generateLandingPageBrief(cluster, productConfig);
    });
    
    return markdown;
  }

  private generateLandingPageBrief(cluster: KeywordCluster, productConfig: any): string {
    const suggestedUrl = this.generateSuggestedUrl(cluster);
    const title = `${cluster.name} | ${productConfig.product}`;
    const h1 = cluster.name;
    
    let brief = `### ${cluster.name} Landing Page Brief\n\n`;
    brief += `**Suggested URL:** \`${suggestedUrl}\`\n`;
    brief += `**Title:** ${title}\n`;
    brief += `**H1:** ${h1}\n\n`;
    
    brief += `**Meta Description:** ${this.generateMetaDescription(cluster, productConfig)}\n\n`;
    
    brief += `**Content Outline:**\n`;
    brief += `1. Hero section with primary value proposition\n`;
    brief += `2. Key features and benefits\n`;
    brief += `3. How it works (step-by-step)\n`;
    brief += `4. FAQ section addressing common queries\n`;
    brief += `5. Call-to-action for Chrome Web Store\n\n`;
    
    brief += `**Target Keywords:**\n`;
    cluster.primaryKeywords.slice(0, 5).forEach(keyword => {
      brief += `- ${keyword.keyword} (${keyword.volume || 'N/A'} volume)\n`;
    });
    
    return brief + '\n';
  }

  private generateMetaDescription(cluster: KeywordCluster, productConfig: any): string {
    const useCase = cluster.name;
    const productName = productConfig.product;
    return `${useCase} with ${productName}. Free, fast, and secure Chrome extension. ${productConfig.value_props[0]}`;
  }

  private generateSuggestedUrl(cluster: KeywordCluster): string {
    const baseUrl = 'https://littlebearapps.com';
    const slug = cluster.useCase
      .toLowerCase()
      .replace(/-related$/, '')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    return `${baseUrl}/extensions/chrome/${slug}`;
  }

  private extractCompetitorsFromCluster(cluster: KeywordCluster, competitorData: Map<string, number>): Array<[string, number]> {
    // This is a simplified implementation - in a real scenario, 
    // we'd have SERP data per keyword to extract specific competitors
    return Array.from(competitorData.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }

  private extractSerpDerivedNegatives(clusters: KeywordCluster[]): string[] {
    const negatives = new Set<string>();
    
    // Extract common non-relevant terms from SERP features
    clusters.forEach(cluster => {
      cluster.keywords.forEach(keyword => {
        if (keyword.serp_features.includes('shopping_results')) {
          negatives.add('buy');
          negatives.add('price');
          negatives.add('cheap');
        }
        if (keyword.serp_features.includes('video_results')) {
          negatives.add('video');
          negatives.add('youtube');
        }
        if (keyword.serp_features.includes('local_pack')) {
          negatives.add('near me');
          negatives.add('location');
        }
      });
    });
    
    return Array.from(negatives);
  }

  /**
   * Writes text content to a file
   * Used for Google Ads Scripts and other text-based outputs
   */
  async writeTextFile(
    content: string, 
    options: WriterOptions & { filename: string }
  ): Promise<string> {
    const outputDir = join(options.outputPath, options.productName, options.date);
    const filePath = join(outputDir, options.filename);

    // Ensure directory exists
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Write content with consistent line endings
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    writeFileSync(filePath, normalizedContent, 'utf8');

    logger.info(`✅ Text file written: ${filePath} (${normalizedContent.length} bytes)`);
    return filePath;
  }

  /**
   * Writes JSON data to a file with deterministic formatting
   */
  async writeJsonFile(
    data: any,
    options: WriterOptions & { filename: string }
  ): Promise<string> {
    const outputDir = join(options.outputPath, options.productName, options.date);
    const filePath = join(outputDir, options.filename);

    // Ensure directory exists
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Use deterministic JSON formatting
    writeJsonFile(filePath, data);

    logger.info(`✅ JSON file written: ${filePath}`);
    return filePath;
  }
}