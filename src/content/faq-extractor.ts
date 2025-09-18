/**
 * FAQ Bank Extractor from SERP/PAA
 * v1.8 Phase 3: Content Roadmap Generation
 */

import { FAQ, FAQSource } from './types.js';

export class FAQExtractor {
  /**
   * Extract FAQs from multiple sources
   */
  async extractFromMultipleSources(
    product: string,
    cluster: string,
    serpData?: any,
    reviews?: any[]
  ): Promise<FAQ[]> {
    const faqs: FAQ[] = [];

    // Extract from SERP People Also Ask
    if (serpData?.peopleAlsoAsk) {
      const paaFAQs = this.extractFromPAA(serpData.peopleAlsoAsk);
      faqs.push(...paaFAQs);
    }

    // Extract from SERP snippets
    if (serpData?.results) {
      const serpFAQs = this.extractFromSERP(serpData.results);
      faqs.push(...serpFAQs);
    }

    // Extract from reviews
    if (reviews && reviews.length > 0) {
      const reviewFAQs = this.extractFromReviews(reviews);
      faqs.push(...reviewFAQs);
    }

    // Generate additional FAQs based on common patterns
    const generatedFAQs = this.generateCommonFAQs(product, cluster);
    faqs.push(...generatedFAQs);

    // Deduplicate and score
    return this.deduplicateAndScore(faqs);
  }

  /**
   * Extract FAQs from People Also Ask section
   */
  extractFromPAA(paaData: any[]): FAQ[] {
    const faqs: FAQ[] = [];

    if (!paaData || !Array.isArray(paaData)) {
      return faqs;
    }

    for (const item of paaData) {
      if (item.question && item.answer) {
        faqs.push({
          question: this.cleanQuestion(item.question),
          answer: this.cleanAnswer(item.answer),
          source: FAQSource.PAA,
          relevance: this.calculateRelevance(item.question, 'paa'),
          searchVolume: item.searchVolume || undefined
        });
      }
    }

    return faqs;
  }

  /**
   * Extract FAQs from SERP results
   */
  extractFromSERP(results: any[]): FAQ[] {
    const faqs: FAQ[] = [];

    if (!results || !Array.isArray(results)) {
      return faqs;
    }

    for (const result of results) {
      // Look for FAQ schema markup in results
      if (result.faqPage) {
        const serpFAQs = this.extractFromFAQSchema(result.faqPage);
        faqs.push(...serpFAQs);
      }

      // Look for Q&A patterns in snippets
      if (result.snippet) {
        const patterns = this.extractQAPatterns(result.snippet);
        faqs.push(...patterns);
      }
    }

    return faqs;
  }

  /**
   * Extract FAQs from reviews
   */
  extractFromReviews(reviews: any[]): FAQ[] {
    const faqs: FAQ[] = [];
    const questionPatterns = [
      /^(is|does|can|will|how|what|why|when|where)\s+/i,
      /\?$/,
      /^wondering\s+/i,
      /^asking\s+/i
    ];

    const commonQuestions = new Map<string, number>();

    // Analyze reviews for common questions
    for (const review of reviews) {
      const text = review.text || review.content || '';

      // Look for question patterns
      const sentences = text.split(/[.!?]+/);
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (questionPatterns.some(pattern => pattern.test(trimmed))) {
          const normalized = this.normalizeQuestion(trimmed);
          commonQuestions.set(normalized, (commonQuestions.get(normalized) || 0) + 1);
        }
      }
    }

    // Convert common questions to FAQs
    for (const [question, frequency] of commonQuestions) {
      if (frequency >= 2) { // Mentioned at least twice
        faqs.push({
          question,
          answer: this.generateAnswerForQuestion(question),
          source: FAQSource.Reviews,
          relevance: Math.min(100, frequency * 20),
          searchVolume: frequency * 10 // Estimate based on review frequency
        });
      }
    }

    return faqs;
  }

  /**
   * Generate common FAQs based on product and cluster
   */
  generateCommonFAQs(product: string, cluster: string): FAQ[] {
    const faqs: FAQ[] = [];

    // Common patterns for extensions
    const commonQuestions = [
      {
        question: `Is ${product} free to use?`,
        answer: `Yes, ${product} is completely free with all core features available at no cost.`
      },
      {
        question: `Does ${product} work offline?`,
        answer: `${product} processes all data locally in your browser for maximum privacy and can work offline once installed.`
      },
      {
        question: `Is ${product} safe to use?`,
        answer: `Absolutely. ${product} is privacy-first and doesn't upload your data to any servers. All processing happens locally.`
      },
      {
        question: `What browsers support ${product}?`,
        answer: `${product} works on Chrome and all Chromium-based browsers including Edge, Brave, and Opera.`
      },
      {
        question: `How do I install ${product}?`,
        answer: `Install ${product} directly from the Chrome Web Store with one click. It's ready to use immediately.`
      }
    ];

    // Cluster-specific questions
    const clusterQuestions = this.getClusterSpecificQuestions(cluster);

    // Add common questions
    for (const q of commonQuestions) {
      faqs.push({
        ...q,
        source: FAQSource.Generated,
        relevance: 70,
        searchVolume: 100
      });
    }

    // Add cluster questions
    for (const q of clusterQuestions) {
      faqs.push({
        ...q,
        source: FAQSource.Generated,
        relevance: 80,
        searchVolume: 150
      });
    }

    return faqs;
  }

  /**
   * Deduplicate and score FAQs
   */
  deduplicateAndScore(faqs: FAQ[]): FAQ[] {
    const uniqueFAQs = new Map<string, FAQ>();

    for (const faq of faqs) {
      const key = this.normalizeQuestion(faq.question);

      if (!uniqueFAQs.has(key)) {
        uniqueFAQs.set(key, faq);
      } else {
        // Keep the one with higher relevance
        const existing = uniqueFAQs.get(key)!;
        if (faq.relevance > existing.relevance) {
          uniqueFAQs.set(key, faq);
        } else if (faq.relevance === existing.relevance && faq.source === FAQSource.PAA) {
          // Prefer PAA source when relevance is equal
          uniqueFAQs.set(key, faq);
        }
      }
    }

    // Sort by relevance
    return Array.from(uniqueFAQs.values())
      .sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Create FAQ bank from FAQs
   */
  createFAQBank(faqs: FAQ[], maxQuestions: number = 10): FAQ[] {
    // Select top FAQs by relevance and diversity
    const selectedFAQs: FAQ[] = [];
    const usedTopics = new Set<string>();

    for (const faq of faqs) {
      if (selectedFAQs.length >= maxQuestions) break;

      const topic = this.extractTopic(faq.question);

      // Ensure diversity by not repeating topics too much
      if (!usedTopics.has(topic) || selectedFAQs.length < maxQuestions / 2) {
        selectedFAQs.push(faq);
        usedTopics.add(topic);
      }
    }

    return selectedFAQs;
  }

  /**
   * Private helper methods
   */
  private cleanQuestion(question: string): string {
    return question
      .trim()
      .replace(/^\W+/, '') // Remove leading non-word chars
      .replace(/\W+$/, '') // Remove trailing non-word chars
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/^\w/, c => c.toUpperCase()); // Capitalize first letter
  }

  private cleanAnswer(answer: string): string {
    return answer
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/^\w/, c => c.toUpperCase()) // Capitalize first letter
      .replace(/([.!?])(?!\s*$)/, '$1 '); // Ensure space after punctuation
  }

  private calculateRelevance(question: string, source: string): number {
    let relevance = 50; // Base relevance

    // Boost for source type
    const sourceBoosts = {
      paa: 30,
      serp: 20,
      reviews: 15,
      generated: 10
    };
    relevance += sourceBoosts[source as keyof typeof sourceBoosts] || 0;

    // Boost for question type
    if (question.toLowerCase().includes('how')) relevance += 10;
    if (question.toLowerCase().includes('why')) relevance += 8;
    if (question.toLowerCase().includes('what')) relevance += 5;

    // Boost for commercial intent
    const commercialTerms = ['price', 'cost', 'free', 'buy', 'purchase'];
    if (commercialTerms.some(term => question.toLowerCase().includes(term))) {
      relevance += 15;
    }

    return Math.min(100, relevance);
  }

  private extractFromFAQSchema(faqSchema: any): FAQ[] {
    const faqs: FAQ[] = [];

    if (faqSchema.mainEntity && Array.isArray(faqSchema.mainEntity)) {
      for (const entity of faqSchema.mainEntity) {
        if (entity.name && entity.acceptedAnswer?.text) {
          faqs.push({
            question: this.cleanQuestion(entity.name),
            answer: this.cleanAnswer(entity.acceptedAnswer.text),
            source: FAQSource.SERP,
            relevance: 85
          });
        }
      }
    }

    return faqs;
  }

  private extractQAPatterns(snippet: string): FAQ[] {
    const faqs: FAQ[] = [];

    // Look for Q: A: patterns
    const qaPattern = /Q:\s*(.+?)\s*A:\s*(.+?)(?=Q:|$)/gi;
    let match;

    while ((match = qaPattern.exec(snippet)) !== null) {
      faqs.push({
        question: this.cleanQuestion(match[1]),
        answer: this.cleanAnswer(match[2]),
        source: FAQSource.SERP,
        relevance: 75
      });
    }

    return faqs;
  }

  private normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  private generateAnswerForQuestion(question: string): string {
    const lowerQuestion = question.toLowerCase();

    if (lowerQuestion.includes('free')) {
      return 'Yes, all core features are available completely free.';
    }
    if (lowerQuestion.includes('safe') || lowerQuestion.includes('secure')) {
      return 'Yes, all data is processed locally in your browser for complete privacy and security.';
    }
    if (lowerQuestion.includes('how') && lowerQuestion.includes('install')) {
      return 'Install directly from the Chrome Web Store with one click.';
    }
    if (lowerQuestion.includes('work') && lowerQuestion.includes('offline')) {
      return 'Yes, once installed, it works offline with no internet connection required.';
    }

    // Generic answer
    return 'This feature is fully supported and optimized for the best user experience.';
  }

  private getClusterSpecificQuestions(cluster: string): Array<{ question: string; answer: string }> {
    const questions: Array<{ question: string; answer: string }> = [];

    // Parse cluster to understand the conversion type
    const parts = cluster.split('-');

    if (parts.includes('to')) {
      const fromFormat = parts[0];
      const toFormat = parts[parts.length - 1];

      questions.push({
        question: `What's the quality difference when converting ${fromFormat} to ${toFormat}?`,
        answer: `Our conversion maintains maximum quality with lossless processing when possible. The output quality depends on the source but we optimize for the best results.`
      });

      questions.push({
        question: `How fast is the ${fromFormat} to ${toFormat} conversion?`,
        answer: `Conversion is instant for most files, processing locally in your browser with no upload delays.`
      });

      questions.push({
        question: `Are there file size limits for ${fromFormat} to ${toFormat}?`,
        answer: `There are no strict limits. Large files are processed efficiently using streaming technology.`
      });
    }

    if (cluster.includes('compress') || cluster.includes('optimization')) {
      questions.push({
        question: 'Can I control the compression level?',
        answer: 'Yes, you can choose between different quality presets or set custom compression levels.'
      });

      questions.push({
        question: 'Will compression reduce image quality?',
        answer: 'Our smart compression maintains visual quality while reducing file size by removing unnecessary data.'
      });
    }

    return questions;
  }

  private extractTopic(question: string): string {
    // Extract main topic/keyword from question
    const stopWords = ['is', 'does', 'can', 'will', 'how', 'what', 'why', 'when', 'where', 'the', 'a', 'an'];
    const words = question.toLowerCase().split(' ')
      .filter(word => !stopWords.includes(word) && word.length > 2);

    return words[0] || 'general';
  }
}