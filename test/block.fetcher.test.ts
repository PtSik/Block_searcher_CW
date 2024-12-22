import { describe, it, expect, vi } from 'vitest';
import { delay, retry, getBlockTimestamp, getTimestampByBlockNumber, getTimestampBySlot, getLatestSlot, getCachedSlotTime } from '../src/utils/block-fetcher';

describe('block-fetcher', () => {
  it('should delay execution for the specified time', async () => {
    const start = Date.now();
    await delay(100);
    const end = Date.now();
    expect(end - start).toBeGreaterThanOrEqual(100);
  });

  it('should retry the function on failure and succeed', async () => {
    const mockFn = vi.fn()
      .mockRejectedValueOnce(new Error('First attempt failed'))
      .mockResolvedValueOnce('Success');
    
    const result = await retry(mockFn, 2, 100);
    expect(result).toBe('Success');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should throw an error after max retries', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('Always fails'));
    
    await expect(retry(mockFn, 2, 100)).rejects.toThrow('Max retries reached: Error: Always fails');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should fetch block timestamp', async () => {
    // Mock fetch response
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        result: {
          timestamp: '0x5f5e100'
        }
      })
    });

    const timestamp = await getBlockTimestamp(123456);
    expect(timestamp).toBe(100000000);
  });

  it('should get timestamp by block number', async () => {
    // Spy on getBlockTimestamp function
    const mockGetBlockTimestamp = vi.spyOn({ getBlockTimestamp }, 'getBlockTimestamp').mockResolvedValue(100000000);

    const timestamp = await getTimestampByBlockNumber(123456);
    expect(timestamp).toBe(100000000);
    expect(mockGetBlockTimestamp).toHaveBeenCalledWith(123456);

    // Restore original function
    mockGetBlockTimestamp.mockRestore();
  });

  it('should get timestamp by slot number', async () => {
    // Spy on getLatestSlot and getCachedSlotTime functions
    const mockGetLatestSlot = vi.spyOn({ getLatestSlot }, 'getLatestSlot').mockResolvedValue(200000);
    const mockGetCachedSlotTime = vi.spyOn({ getCachedSlotTime }, 'getCachedSlotTime').mockResolvedValue(100000000);

    const timestamp = await getTimestampBySlot(123456);
    expect(timestamp).toBe(100000000);
    expect(mockGetLatestSlot).toHaveBeenCalled();
    expect(mockGetCachedSlotTime).toHaveBeenCalledWith(123456);

    // Restore original functions
    mockGetLatestSlot.mockRestore();
    mockGetCachedSlotTime.mockRestore();
  });

  it('should throw an error if slot number is out of range', async () => {
    // Spy on getLatestSlot function
    const mockGetLatestSlot = vi.spyOn({ getLatestSlot }, 'getLatestSlot').mockResolvedValue(100000);

    await expect(getTimestampBySlot(200000)).rejects.toThrow('Slot 200000 is out of range. Latest slot is 100000.');

    // Restore original function
    mockGetLatestSlot.mockRestore();
  });
});