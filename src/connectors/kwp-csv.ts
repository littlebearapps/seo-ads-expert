import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { parse } from 'csv-parse';
import pino from 'pino';
import { KeywordData, KeywordDataSchema, KwpCsvRow, KwpCsvRowSchema } from './types.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export interface KwpCsvImportResult {
  keywords: KeywordData[];
  totalRows: number;
  validRows: number;
  markets: string[];
  filesProcessed: string[];
  warnings: string[];
}

export class KwpCsvConnector {
  private readonly inputPath: string;

  constructor() {
    this.inputPath = join(process.cwd(), 'inputs', 'kwp_csv');
  }

  async importProductData(productName: string): Promise<KwpCsvImportResult> {
    const productPath = join(this.inputPath, productName);
    const result: KwpCsvImportResult = {
      keywords: [],
      totalRows: 0,
      validRows: 0,
      markets: [],
      filesProcessed: [],
      warnings: []
    };

    logger.info(`🔍 Looking for KWP CSV files in: ${productPath}`);

    if (!existsSync(productPath)) {
      result.warnings.push(`KWP CSV directory not found: ${productPath}`);
      logger.warn(`⚠️  KWP CSV directory not found: ${productPath}`);
      return result;
    }

    const csvFiles = this.findCsvFiles(productPath);
    
    if (csvFiles.length === 0) {
      result.warnings.push(`No CSV files found in: ${productPath}`);
      logger.warn(`⚠️  No CSV files found in: ${productPath}`);
      return result;
    }

    logger.info(`📁 Found ${csvFiles.length} CSV files to process`);

    for (const csvFile of csvFiles) {
      try {
        const market = this.extractMarketFromFilename(csvFile);
        const fileResult = await this.processCsvFile(csvFile, market);
        
        result.keywords.push(...fileResult.keywords);
        result.totalRows += fileResult.totalRows;
        result.validRows += fileResult.validRows;
        result.filesProcessed.push(basename(csvFile));
        result.warnings.push(...fileResult.warnings);
        
        if (market && !result.markets.includes(market)) {
          result.markets.push(market);
        }

        logger.info(`✅ Processed ${csvFile}: ${fileResult.validRows}/${fileResult.totalRows} valid rows`);
        
      } catch (error) {
        const errorMsg = `Failed to process ${csvFile}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.warnings.push(errorMsg);
        logger.error(`❌ ${errorMsg}`);
      }
    }

    // Validate CSV freshness
    this.validateCsvFreshness(csvFiles, result);

    logger.info(`🎯 KWP CSV import complete: ${result.validRows} keywords from ${result.filesProcessed.length} files`);
    logger.info(`📊 Markets found: ${result.markets.join(', ')}`);

    return result;
  }

  private findCsvFiles(directory: string): string[] {
    const csvFiles: string[] = [];
    
    try {
      const entries = readdirSync(directory);
      
      for (const entry of entries) {
        const fullPath = join(directory, entry);
        const stat = statSync(fullPath);
        
        if (stat.isFile() && entry.toLowerCase().endsWith('.csv')) {
          csvFiles.push(fullPath);
        }
      }
    } catch (error) {
      logger.error(`❌ Error reading directory ${directory}:`, error);
    }

    return csvFiles.sort(); // Consistent ordering
  }

  private async processCsvFile(filePath: string, market?: string): Promise<{
    keywords: KeywordData[];
    totalRows: number;
    validRows: number;
    warnings: string[];
  }> {
    const fileContent = readFileSync(filePath, 'utf8');
    const keywords: KeywordData[] = [];
    const warnings: string[] = [];
    let totalRows = 0;
    let validRows = 0;

    return new Promise((resolve, reject) => {
      parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }, (error, records: unknown[]) => {
        if (error) {
          reject(error);
          return;
        }

        totalRows = records.length;
        logger.debug(`📋 Processing ${totalRows} rows from ${basename(filePath)}`);

        for (let i = 0; i < records.length; i++) {
          try {
            const rawRow = records[i] as Record<string, string>;
            const csvRow = this.normalizeKwpRow(rawRow);
            
            // Validate the row structure
            const validatedRow = KwpCsvRowSchema.parse(csvRow);
            
            if (!validatedRow.keyword || validatedRow.keyword.trim() === '') {
              warnings.push(`Row ${i + 1}: Empty keyword field`);
              continue;
            }

            // Convert to KeywordData format
            const keywordData = this.convertKwpRowToKeywordData(validatedRow, market);
            const validatedKeyword = KeywordDataSchema.parse(keywordData);
            
            keywords.push(validatedKeyword);
            validRows++;
            
          } catch (parseError) {
            const errorMsg = `Row ${i + 1}: ${parseError instanceof Error ? parseError.message : 'Parse error'}`;
            warnings.push(errorMsg);
            logger.debug(`⚠️  ${errorMsg}`);
          }
        }

        resolve({ keywords, totalRows, validRows, warnings });
      });
    });
  }

  private normalizeKwpRow(rawRow: Record<string, string>): Partial<KwpCsvRow> {
    // Handle various column name formats from different KWP exports
    const normalizedRow: Partial<KwpCsvRow> = {};
    
    // Keyword field (required)
    const keywordFields = ['keyword', 'Keyword', 'KEYWORD', 'search term', 'Search term'];
    for (const field of keywordFields) {
      if (rawRow[field]) {
        normalizedRow.keyword = rawRow[field].trim();
        break;
      }
    }

    // Average monthly searches
    const volumeFields = ['avg_monthly_searches', 'Avg. monthly searches', 'Average monthly searches', 'Search Volume'];
    for (const field of volumeFields) {
      if (rawRow[field]) {
        normalizedRow.avg_monthly_searches = rawRow[field].replace(/[^0-9.-]/g, ''); // Remove commas, currency symbols
        break;
      }
    }

    // Competition
    const competitionFields = ['competition', 'Competition', 'COMPETITION'];
    for (const field of competitionFields) {
      if (rawRow[field]) {
        normalizedRow.competition = rawRow[field];
        break;
      }
    }

    // Competition index (0.0-1.0)
    const competitionIndexFields = ['competition_index', 'Competition (indexed value)', 'Competition Index'];
    for (const field of competitionIndexFields) {
      if (rawRow[field]) {
        normalizedRow.competition_index = rawRow[field];
        break;
      }
    }

    // Bid estimates
    const lowBidFields = ['top_of_page_bid_low', 'Top of page bid (low range)', 'Low bid'];
    for (const field of lowBidFields) {
      if (rawRow[field]) {
        normalizedRow.top_of_page_bid_low = rawRow[field].replace(/[^0-9.-]/g, '');
        break;
      }
    }

    const highBidFields = ['top_of_page_bid_high', 'Top of page bid (high range)', 'High bid'];
    for (const field of highBidFields) {
      if (rawRow[field]) {
        normalizedRow.top_of_page_bid_high = rawRow[field].replace(/[^0-9.-]/g, '');
        break;
      }
    }

    return normalizedRow;
  }

  private convertKwpRowToKeywordData(row: KwpCsvRow, market?: string): Partial<KeywordData> {
    const keyword: Partial<KeywordData> = {
      keyword: row.keyword,
      data_source: 'kwp' as const,
      markets: market ? [market] : [],
    };

    // Parse volume
    if (row.avg_monthly_searches) {
      const volume = parseInt(row.avg_monthly_searches, 10);
      if (!isNaN(volume) && volume >= 0) {
        keyword.volume = volume;
      }
    }

    // Parse competition (convert text to numeric)
    if (row.competition) {
      const comp = row.competition.toLowerCase();
      if (comp === 'low') {
        keyword.competition = 0.3;
      } else if (comp === 'medium') {
        keyword.competition = 0.6;
      } else if (comp === 'high') {
        keyword.competition = 0.9;
      }
    }

    // Use competition index if available (more precise)
    if (row.competition_index) {
      const compIndex = parseFloat(row.competition_index);
      if (!isNaN(compIndex) && compIndex >= 0 && compIndex <= 1) {
        keyword.competition = compIndex;
      }
    }

    // Parse CPC (use average of low and high bids)
    const lowBid = row.top_of_page_bid_low ? parseFloat(row.top_of_page_bid_low) : null;
    const highBid = row.top_of_page_bid_high ? parseFloat(row.top_of_page_bid_high) : null;
    
    if (lowBid !== null && highBid !== null && !isNaN(lowBid) && !isNaN(highBid)) {
      keyword.cpc = (lowBid + highBid) / 2;
    } else if (lowBid !== null && !isNaN(lowBid)) {
      keyword.cpc = lowBid;
    } else if (highBid !== null && !isNaN(highBid)) {
      keyword.cpc = highBid;
    }

    return keyword;
  }

  private extractMarketFromFilename(filePath: string): string | undefined {
    const filename = basename(filePath, '.csv').toLowerCase();
    
    // Common market patterns in filenames
    const marketPatterns = [
      /[_-](au|australia)/i,
      /[_-](us|usa|united[_-]states)/i,
      /[_-](gb|uk|united[_-]kingdom)/i,
      /[_-](ca|canada)/i,
      /[_-](de|germany)/i,
      /[_-](fr|france)/i,
    ];

    for (const pattern of marketPatterns) {
      const match = filename.match(pattern);
      if (match) {
        const market = match[1].toLowerCase();
        // Normalize common variations
        if (market === 'australia') return 'AU';
        if (market === 'usa' || market === 'united-states' || market === 'united_states') return 'US';
        if (market === 'uk' || market === 'united-kingdom' || market === 'united_kingdom') return 'GB';
        return market.toUpperCase();
      }
    }

    logger.debug(`🤷 Could not extract market from filename: ${filename}`);
    return undefined;
  }

  private validateCsvFreshness(csvFiles: string[], result: KwpCsvImportResult): void {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    for (const csvFile of csvFiles) {
      try {
        const stats = statSync(csvFile);
        const fileAge = Date.now() - stats.mtime.getTime();
        const daysOld = Math.floor(fileAge / (24 * 60 * 60 * 1000));
        
        if (stats.mtime.getTime() < thirtyDaysAgo) {
          const warning = `${basename(csvFile)} is ${daysOld} days old (consider updating KWP data)`;
          result.warnings.push(warning);
          logger.warn(`⚠️  ${warning}`);
        } else {
          logger.debug(`✅ ${basename(csvFile)} is ${daysOld} days old (fresh)`);
        }
      } catch (error) {
        logger.debug(`Could not check freshness for ${csvFile}:`, error);
      }
    }
  }
}