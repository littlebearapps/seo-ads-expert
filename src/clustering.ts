import pino from 'pino';
import { KeywordData, ProductConfig } from './connectors/types.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export interface KeywordCluster {
  id: string;
  name: string;
  keywords: KeywordData[];
  primaryKeywords: KeywordData[];    // Top scoring keywords in cluster
  secondaryKeywords: KeywordData[];  // Supporting keywords in cluster
  landingPage?: string;              // Mapped landing page URL
  landingPagePurpose?: string;       // main, use-case, feature, docs, pricing
  totalVolume: number;               // Sum of all keyword volumes
  averageScore: number;              // Average final score
  intentLevel: 'highest' | 'high' | 'medium' | 'baseline';
  useCase: string;                   // Detected use case (webp conversion, color picking, etc.)
}

export interface ClusteringResult {
  clusters: KeywordCluster[];
  clusterStats: {
    totalClusters: number;
    totalKeywords: number;
    mappedToPages: number;
    unmappedClusters: number;
    averageKeywordsPerCluster: number;
  };
  landingPageGaps: string[];         // Detected use cases without landing pages
  warnings: string[];
}

export interface ClusteringOptions {
  maxClusters?: number;
  minKeywordsPerCluster?: number;
  similarityThreshold?: number;
}

export class KeywordClusteringEngine {
  
  clusterKeywords(
    keywords: KeywordData[], 
    productConfig: ProductConfig,
    options: ClusteringOptions = {}
  ): ClusteringResult {
    const opts = {
      maxClusters: options.maxClusters || 15,
      minKeywordsPerCluster: options.minKeywordsPerCluster || 2,
      similarityThreshold: options.similarityThreshold || 0.4
    };

    logger.info(`🧩 Starting keyword clustering for ${keywords.length} keywords`);
    
    const result: ClusteringResult = {
      clusters: [],
      clusterStats: {
        totalClusters: 0,
        totalKeywords: keywords.length,
        mappedToPages: 0,
        unmappedClusters: 0,
        averageKeywordsPerCluster: 0
      },
      landingPageGaps: [],
      warnings: []
    };

    if (keywords.length === 0) {
      result.warnings.push('No keywords provided for clustering');
      return result;
    }

    // Step 1: Pre-cluster by semantic similarity using n-gram analysis
    const semanticClusters = this.performSemanticClustering(keywords, opts.similarityThreshold);
    logger.debug(`📊 Created ${semanticClusters.length} semantic clusters`);

    // Step 2: Refine clusters by use case detection
    const useCaseClusters = this.refineByUseCase(semanticClusters, productConfig);
    logger.debug(`🎯 Refined to ${useCaseClusters.length} use-case clusters`);

    // Step 3: Map clusters to landing pages
    const mappedClusters = this.mapToLandingPages(useCaseClusters, productConfig);
    
    // Step 4: Identify clusters that need new landing pages
    const finalClusters = this.identifyLandingPageGaps(mappedClusters, result);

    // Step 5: Sort and limit clusters
    const sortedClusters = this.sortAndLimitClusters(finalClusters, opts.maxClusters);

    result.clusters = sortedClusters;
    result.clusterStats.totalClusters = sortedClusters.length;
    result.clusterStats.mappedToPages = sortedClusters.filter(c => c.landingPage).length;
    result.clusterStats.unmappedClusters = sortedClusters.filter(c => !c.landingPage).length;
    result.clusterStats.averageKeywordsPerCluster = sortedClusters.length > 0 
      ? sortedClusters.reduce((sum, c) => sum + c.keywords.length, 0) / sortedClusters.length 
      : 0;

    logger.info(`✅ Clustering complete: ${result.clusters.length} clusters created`);
    logger.info(`📈 Mapping: ${result.clusterStats.mappedToPages}/${result.clusterStats.totalClusters} clusters mapped to landing pages`);
    
    if (result.landingPageGaps.length > 0) {
      logger.info(`💡 Landing page opportunities: ${result.landingPageGaps.length} new pages recommended`);
    }

    return result;
  }

  private performSemanticClustering(keywords: KeywordData[], threshold: number): KeywordCluster[] {
    const clusters: KeywordCluster[] = [];
    const processed = new Set<string>();

    for (const keyword of keywords) {
      if (processed.has(keyword.keyword)) continue;

      // Find similar keywords using n-gram similarity
      const similarKeywords = [keyword];
      processed.add(keyword.keyword);

      for (const candidate of keywords) {
        if (processed.has(candidate.keyword)) continue;
        
        const similarity = this.calculateNGramSimilarity(keyword.keyword, candidate.keyword);
        if (similarity >= threshold) {
          similarKeywords.push(candidate);
          processed.add(candidate.keyword);
        }
      }

      if (similarKeywords.length >= 1) { // Allow single-keyword clusters for now
        const cluster = this.createCluster(similarKeywords);
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  private calculateNGramSimilarity(str1: string, str2: string): number {
    // Normalize strings
    const normalize = (str: string) => str.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2); // Remove short words

    const words1 = normalize(str1);
    const words2 = normalize(str2);

    if (words1.length === 0 || words2.length === 0) return 0;

    // Create bigrams and trigrams
    const getBigrams = (words: string[]) => {
      const bigrams = [];
      for (let i = 0; i < words.length - 1; i++) {
        bigrams.push(`${words[i]} ${words[i + 1]}`);
      }
      return bigrams;
    };

    const getTrigrams = (words: string[]) => {
      const trigrams = [];
      for (let i = 0; i < words.length - 2; i++) {
        trigrams.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
      }
      return trigrams;
    };

    // Calculate Jaccard similarity for words
    const wordSimilarity = this.jaccardSimilarity(new Set(words1), new Set(words2));

    // Calculate Jaccard similarity for bigrams
    const bigrams1 = new Set(getBigrams(words1));
    const bigrams2 = new Set(getBigrams(words2));
    const bigramSimilarity = bigrams1.size > 0 && bigrams2.size > 0 
      ? this.jaccardSimilarity(bigrams1, bigrams2) 
      : 0;

    // Calculate Jaccard similarity for trigrams  
    const trigrams1 = new Set(getTrigrams(words1));
    const trigrams2 = new Set(getTrigrams(words2));
    const trigramSimilarity = trigrams1.size > 0 && trigrams2.size > 0
      ? this.jaccardSimilarity(trigrams1, trigrams2)
      : 0;

    // Weighted combination (trigrams > bigrams > words)
    const similarity = (trigramSimilarity * 0.5) + (bigramSimilarity * 0.3) + (wordSimilarity * 0.2);
    
    return similarity;
  }

  private jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  private refineByUseCase(clusters: KeywordCluster[], productConfig: ProductConfig): KeywordCluster[] {
    const refinedClusters: KeywordCluster[] = [];

    for (const cluster of clusters) {
      // Detect use case from cluster keywords
      const useCase = this.detectUseCase(cluster, productConfig);
      cluster.useCase = useCase;
      
      // Update cluster name based on use case
      cluster.name = this.generateClusterName(cluster, useCase);

      refinedClusters.push(cluster);
    }

    // Merge clusters with same use case if they're small
    return this.mergeSmallClustersWithSameUseCase(refinedClusters);
  }

  private detectUseCase(cluster: KeywordCluster, productConfig: ProductConfig): string {
    const allKeywords = cluster.keywords.map(k => k.keyword.toLowerCase()).join(' ');
    
    // Product-specific use case detection
    if (productConfig.product === 'ConvertMyFile') {
      if (allKeywords.includes('webp') && allKeywords.includes('png')) return 'webp-to-png';
      if (allKeywords.includes('heic') && allKeywords.includes('jpg')) return 'heic-to-jpg';
      if (allKeywords.includes('pdf') && (allKeywords.includes('jpg') || allKeywords.includes('image'))) return 'pdf-to-jpg';
      if (allKeywords.includes('compress') && allKeywords.includes('pdf')) return 'compress-pdf';
      if (allKeywords.includes('convert') && allKeywords.includes('image')) return 'image-conversion';
      if (allKeywords.includes('convert') && allKeywords.includes('file')) return 'file-conversion';
      if (allKeywords.includes('batch') && allKeywords.includes('convert')) return 'batch-conversion';
    }

    if (productConfig.product === 'PaletteKit') {
      if (allKeywords.includes('color') && allKeywords.includes('picker')) return 'color-picker';
      if (allKeywords.includes('eyedropper')) return 'eyedropper';
      if (allKeywords.includes('page') && allKeywords.includes('scan')) return 'page-scanner';
      if (allKeywords.includes('color') && allKeywords.includes('palette')) return 'color-palette';
      if (allKeywords.includes('export') && allKeywords.includes('color')) return 'color-export';
      if (allKeywords.includes('hex') && allKeywords.includes('color')) return 'hex-colors';
      if (allKeywords.includes('css') && allKeywords.includes('color')) return 'css-colors';
    }

    if (productConfig.product === 'NoteBridge') {
      if (allKeywords.includes('obsidian')) return 'obsidian-integration';
      if (allKeywords.includes('notion')) return 'notion-integration';
      if (allKeywords.includes('research') && allKeywords.includes('capture')) return 'research-capture';
      if (allKeywords.includes('web') && allKeywords.includes('clipper')) return 'web-clipper';
      if (allKeywords.includes('bookmark') && allKeywords.includes('organize')) return 'bookmark-organizer';
      if (allKeywords.includes('note') && allKeywords.includes('sync')) return 'note-sync';
    }

    // Generic use cases
    if (allKeywords.includes('chrome extension')) return 'chrome-extension-main';
    if (allKeywords.includes('browser') && allKeywords.includes('tool')) return 'browser-tool';
    if (allKeywords.includes('free') && allKeywords.includes('tool')) return 'free-tool';
    
    // Fallback: use most frequent meaningful word
    const words = allKeywords.split(' ');
    const meaningfulWords = words.filter(word => 
      word.length > 3 && 
      !['chrome', 'extension', 'browser', 'free', 'online', 'tool'].includes(word)
    );
    
    if (meaningfulWords.length > 0) {
      const wordCounts = meaningfulWords.reduce((counts, word) => {
        counts[word] = (counts[word] || 0) + 1;
        return counts;
      }, {} as Record<string, number>);
      
      const topWord = Object.entries(wordCounts)
        .sort(([,a], [,b]) => b - a)[0][0];
        
      return `${topWord}-related`;
    }

    return 'general';
  }

  private generateClusterName(cluster: KeywordCluster, useCase: string): string {
    // Generate human-readable cluster name
    const useCaseNames: Record<string, string> = {
      'webp-to-png': 'WebP to PNG Conversion',
      'heic-to-jpg': 'HEIC to JPG Conversion', 
      'pdf-to-jpg': 'PDF to JPG Conversion',
      'compress-pdf': 'PDF Compression',
      'image-conversion': 'Image File Conversion',
      'file-conversion': 'General File Conversion',
      'batch-conversion': 'Batch File Conversion',
      'color-picker': 'Color Picker Tool',
      'eyedropper': 'Eyedropper Tool',
      'page-scanner': 'Page Color Scanner',
      'color-palette': 'Color Palette Management',
      'color-export': 'Color Export Features',
      'hex-colors': 'Hex Color Tools',
      'css-colors': 'CSS Color Tools',
      'obsidian-integration': 'Obsidian Integration',
      'notion-integration': 'Notion Integration',
      'research-capture': 'Research Capture',
      'web-clipper': 'Web Clipper',
      'bookmark-organizer': 'Bookmark Organization',
      'note-sync': 'Note Synchronization',
      'chrome-extension-main': 'Chrome Extension Core',
      'browser-tool': 'Browser Tool',
      'free-tool': 'Free Tool',
      'general': 'General Keywords'
    };

    return useCaseNames[useCase] || useCase.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private mergeSmallClustersWithSameUseCase(clusters: KeywordCluster[]): KeywordCluster[] {
    const useCaseMap = new Map<string, KeywordCluster[]>();
    
    // Group clusters by use case
    for (const cluster of clusters) {
      const useCase = cluster.useCase;
      if (!useCaseMap.has(useCase)) {
        useCaseMap.set(useCase, []);
      }
      useCaseMap.get(useCase)!.push(cluster);
    }

    const mergedClusters: KeywordCluster[] = [];

    for (const [useCase, clustersInUseCase] of useCaseMap.entries()) {
      if (clustersInUseCase.length === 1) {
        // Single cluster for this use case
        mergedClusters.push(clustersInUseCase[0]);
      } else {
        // Multiple small clusters - merge if combined size is reasonable
        const totalKeywords = clustersInUseCase.reduce((sum, c) => sum + c.keywords.length, 0);
        
        if (totalKeywords <= 15) {
          // Merge small clusters
          const mergedCluster = this.mergeClusters(clustersInUseCase, useCase);
          mergedClusters.push(mergedCluster);
        } else {
          // Keep separate if too large when combined
          mergedClusters.push(...clustersInUseCase);
        }
      }
    }

    return mergedClusters;
  }

  private mapToLandingPages(clusters: KeywordCluster[], productConfig: ProductConfig): KeywordCluster[] {
    for (const cluster of clusters) {
      // Try to map to existing landing pages
      const mappedPage = this.findMatchingLandingPage(cluster, productConfig);
      
      if (mappedPage) {
        cluster.landingPage = mappedPage.url;
        cluster.landingPagePurpose = mappedPage.purpose;
      }
    }

    return clusters;
  }

  private findMatchingLandingPage(cluster: KeywordCluster, productConfig: ProductConfig) {
    const useCase = cluster.useCase.toLowerCase();
    
    // Direct use case mapping
    for (const page of productConfig.target_pages) {
      const pageUrl = page.url.toLowerCase();
      
      // Check if use case matches page URL patterns
      if (useCase.includes('webp') && pageUrl.includes('webp-to-png')) return page;
      if (useCase.includes('heic') && pageUrl.includes('heic-to-jpg')) return page;
      if (useCase.includes('pdf-to-jpg') && pageUrl.includes('pdf-to-jpg')) return page;
      if (useCase.includes('compress') && pageUrl.includes('compress-pdf')) return page;
      if (useCase.includes('color-picker') && pageUrl.includes('color-picker')) return page;
      if (useCase.includes('page-scanner') && pageUrl.includes('page-scanner')) return page;
      if (useCase.includes('export') && pageUrl.includes('export-formats')) return page;
      if (useCase.includes('obsidian') && pageUrl.includes('obsidian')) return page;
      if (useCase.includes('notion') && pageUrl.includes('notion')) return page;
      if (useCase.includes('research') && pageUrl.includes('research-workflow')) return page;
      
      // Fallback to main page for core extension keywords
      if (useCase.includes('chrome-extension-main') && page.purpose === 'main') return page;
    }

    return null;
  }

  private identifyLandingPageGaps(clusters: KeywordCluster[], result: ClusteringResult): KeywordCluster[] {
    const gaps: string[] = [];

    for (const cluster of clusters) {
      if (!cluster.landingPage && cluster.keywords.length >= 3 && cluster.totalVolume > 100) {
        // High-potential cluster without landing page
        const suggestedUrl = this.generateSuggestedLandingPageUrl(cluster);
        gaps.push(`${cluster.name} (${cluster.keywords.length} keywords, ${cluster.totalVolume} volume) → ${suggestedUrl}`);
      }
    }

    result.landingPageGaps = gaps;
    return clusters;
  }

  private generateSuggestedLandingPageUrl(cluster: KeywordCluster): string {
    const baseUrl = 'https://littlebearapps.com';
    const useCase = cluster.useCase.replace(/-related$/, '').replace(/\s+/g, '-').toLowerCase();
    
    // Generate URL based on product and use case
    if (cluster.keywords.some(k => k.keyword.includes('convertmyfile'))) {
      return `${baseUrl}/convertmyfile/${useCase}`;
    } else if (cluster.keywords.some(k => k.keyword.includes('palettekit'))) {
      return `${baseUrl}/palettekit/${useCase}`;
    } else if (cluster.keywords.some(k => k.keyword.includes('notebridge'))) {
      return `${baseUrl}/notebridge/${useCase}`;
    }

    return `${baseUrl}/extensions/chrome/${useCase}`;
  }

  private sortAndLimitClusters(clusters: KeywordCluster[], maxClusters: number): KeywordCluster[] {
    // Sort by total volume (descending), then by average score
    const sortedClusters = clusters.sort((a, b) => {
      if (b.totalVolume !== a.totalVolume) {
        return b.totalVolume - a.totalVolume;
      }
      return b.averageScore - a.averageScore;
    });

    return sortedClusters.slice(0, maxClusters);
  }

  private createCluster(keywords: KeywordData[]): KeywordCluster {
    const sortedKeywords = keywords.sort((a, b) => b.final_score - a.final_score);
    
    const totalVolume = keywords.reduce((sum, k) => sum + (k.volume || 0), 0);
    const averageScore = keywords.reduce((sum, k) => sum + k.final_score, 0) / keywords.length;
    
    // Determine primary vs secondary keywords
    const medianScore = sortedKeywords[Math.floor(sortedKeywords.length / 2)].final_score;
    const primaryKeywords = sortedKeywords.filter(k => k.final_score >= medianScore);
    const secondaryKeywords = sortedKeywords.filter(k => k.final_score < medianScore);

    // Determine intent level based on highest scoring keywords
    const topIntentScore = Math.max(...keywords.map(k => k.intent_score));
    let intentLevel: KeywordCluster['intentLevel'];
    if (topIntentScore >= 2.3) intentLevel = 'highest';
    else if (topIntentScore >= 2.0) intentLevel = 'high';
    else if (topIntentScore >= 1.5) intentLevel = 'medium';
    else intentLevel = 'baseline';

    return {
      id: this.generateClusterId(keywords[0].keyword),
      name: keywords[0].keyword, // Temporary, will be updated in refineByUseCase
      keywords: sortedKeywords,
      primaryKeywords,
      secondaryKeywords,
      totalVolume,
      averageScore,
      intentLevel,
      useCase: 'unknown' // Will be detected in refineByUseCase
    };
  }

  private mergeClusters(clusters: KeywordCluster[], useCase: string): KeywordCluster {
    const allKeywords = clusters.flatMap(c => c.keywords);
    const mergedCluster = this.createCluster(allKeywords);
    
    mergedCluster.useCase = useCase;
    mergedCluster.name = this.generateClusterName(mergedCluster, useCase);
    
    return mergedCluster;
  }

  private generateClusterId(primaryKeyword: string): string {
    return primaryKeyword
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 30); // Limit length
  }

  generateClusteringReport(result: ClusteringResult): string {
    const stats = result.clusterStats;
    
    return `
🧩 Keyword Clustering Report
===========================
Total Keywords: ${stats.totalKeywords}
Clusters Created: ${stats.totalClusters}
Average Keywords per Cluster: ${stats.averageKeywordsPerCluster.toFixed(1)}

📄 Landing Page Mapping:
- Mapped to existing pages: ${stats.mappedToPages}
- Need new landing pages: ${stats.unmappedClusters}

🎯 Top 5 Clusters by Volume:
${result.clusters.slice(0, 5).map((c, i) => 
  `${i + 1}. ${c.name} (${c.keywords.length} keywords, ${c.totalVolume.toLocaleString()} volume)`
).join('\n')}

${result.landingPageGaps.length > 0 ? `\n💡 Landing Page Opportunities:\n${result.landingPageGaps.slice(0, 5).map(gap => `- ${gap}`).join('\n')}` : ''}

${result.warnings.length > 0 ? `\n⚠️ Warnings:\n${result.warnings.map(w => `- ${w}`).join('\n')}` : ''}
`.trim();
  }
}