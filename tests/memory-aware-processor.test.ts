import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryAwareProcessor, processBatchWithMemoryCheck } from '../src/utils/memory-aware-processor.js';

describe('MemoryAwareProcessor', () => {
  let processor: MemoryAwareProcessor;

  beforeEach(() => {
    processor = new MemoryAwareProcessor({
      maxMemoryMB: 256,
      batchSize: 10,
      gcThreshold: 0.8,
      progressInterval: 5
    });
  });

  describe('processInBatches', () => {
    it('should process items in batches', async () => {
      const items = Array.from({ length: 25 }, (_, i) => i);
      const processedBatches: number[][] = [];

      const results = await processor.processInBatches(
        items,
        async (batch) => {
          processedBatches.push([...batch]);
          return batch.map(n => n * 2);
        },
        10
      );

      expect(results).toHaveLength(25);
      expect(results).toEqual(items.map(n => n * 2));
      expect(processedBatches).toHaveLength(3); // 10, 10, 5
      expect(processedBatches[0]).toHaveLength(10);
      expect(processedBatches[1]).toHaveLength(10);
      expect(processedBatches[2]).toHaveLength(5);
    });

    it('should handle batch processing errors gracefully', async () => {
      const items = [1, 2, 3, 4, 5];
      let callCount = 0;

      const results = await processor.processInBatches(
        items,
        async (batch) => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Batch processing error');
          }
          return batch.map(n => n * 2);
        },
        2
      );

      // First batch succeeds, second fails, third succeeds
      expect(results).toEqual([2, 4, 10]); // Only first and third batches
    });

    it('should track statistics correctly', async () => {
      const items = Array.from({ length: 20 }, (_, i) => i);

      await processor.processInBatches(
        items,
        async (batch) => batch.map(n => n * 2),
        10
      );

      const stats = processor.getStats();
      expect(stats.totalItems).toBe(20);
      expect(stats.processedItems).toBe(20);
      expect(stats.failedItems).toBe(0);
      expect(stats.processingTime).toBeGreaterThan(0);
    });
  });

  describe('processConcurrently', () => {
    it('should process items concurrently', async () => {
      const items = Array.from({ length: 20 }, (_, i) => i);
      const concurrentProcessor = new MemoryAwareProcessor({
        maxMemoryMB: 256,
        concurrency: 3
      });

      const processOrder: number[] = [];
      const results = await concurrentProcessor.processConcurrently(
        items,
        async (item) => {
          processOrder.push(item);
          await new Promise(resolve => setTimeout(resolve, 10));
          return item * 2;
        },
        { batchSize: 5 }
      );

      expect(results).toHaveLength(20);
      expect(results).toEqual(items.map(n => n * 2));

      // Check that items were processed in concurrent batches
      const stats = concurrentProcessor.getStats();
      expect(stats.processedItems).toBe(20);
    });
  });

  describe('streamProcess', () => {
    it('should stream process items in batches', async () => {
      const items = Array.from({ length: 15 }, (_, i) => i);
      const batches: number[][] = [];

      const generator = processor.streamProcess(
        items,
        async (item) => item * 2,
        5
      );

      for await (const batch of generator) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(3);
      expect(batches[0]).toEqual([0, 2, 4, 6, 8]);
      expect(batches[1]).toEqual([10, 12, 14, 16, 18]);
      expect(batches[2]).toEqual([20, 22, 24, 26, 28]);
    });

    it('should handle stream errors gracefully', async () => {
      const items = [1, 2, 3, 4, 5];
      const results: number[][] = [];

      const generator = processor.streamProcess(
        items,
        async (item) => {
          if (item === 3) {
            throw new Error('Processing error');
          }
          return item * 2;
        },
        2
      );

      for await (const batch of generator) {
        results.push(batch);
      }

      // Should continue processing despite error
      expect(results.flat()).toEqual([2, 4, 8, 10]); // 3*2=6 is missing

      const stats = processor.getStats();
      expect(stats.failedItems).toBe(1);
    });
  });

  describe('memory management', () => {
    it('should get memory statistics', () => {
      const memStats = processor.getMemoryStats();

      expect(memStats).toHaveProperty('rss');
      expect(memStats).toHaveProperty('heapTotal');
      expect(memStats).toHaveProperty('heapUsed');
      expect(memStats).toHaveProperty('external');
      expect(memStats).toHaveProperty('arrayBuffers');

      // All values should be positive numbers (MB)
      expect(memStats.rss).toBeGreaterThan(0);
      expect(memStats.heapUsed).toBeGreaterThan(0);
    });

    it('should cleanup large objects from memory', () => {
      const largeObject = {
        smallArray: [1, 2, 3],
        largeArray: new Array(2000).fill('data'),
        smallObject: { key: 'value' },
        largeObject: { data: 'x'.repeat(2000000) }
      };

      MemoryAwareProcessor.cleanupMemory(largeObject);

      expect(largeObject.smallArray).toEqual([1, 2, 3]);
      expect(largeObject.largeArray).toEqual([]);
      expect(largeObject.smallObject).toEqual({ key: 'value' });
      expect(largeObject.largeObject).toBeNull();
    });
  });

  describe('utility function', () => {
    it('should process batch with memory check', async () => {
      const items = Array.from({ length: 10 }, (_, i) => i);

      const results = await processBatchWithMemoryCheck(
        items,
        async (batch) => batch.map(n => n * 3),
        { batchSize: 5 }
      );

      expect(results).toHaveLength(10);
      expect(results).toEqual(items.map(n => n * 3));
    });
  });
});