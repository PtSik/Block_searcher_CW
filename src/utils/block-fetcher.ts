// src/utils/block-fetcher.ts

const EVM_RPC_URL =
  "https://mainnet.infura.io/v3/d329f1cc50934c01ae4f89c0662b71b4";
const SOLANA_RPC_URL =
  "https://solana-mainnet.g.alchemy.com/v2/bAe1SR58rtVmDbeol7FUMnPCZbvqi5WZ";

const MAX_SEARCH_OFFSET = 100;
const TIME_DIFFERENCE_THRESHOLD = 60; // seconds

const slotTimeCache: Record<number, number> = {};
const blockTimestampCache: Record<number, number> = {};

// Helper function to delay execution
export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry function for transient errors
export async function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries - 1)
        throw new Error(`Max retries reached: ${String(error)}`);
      await delay(delayMs);
    }
  }
  throw new Error("Max retries reached without success.");
}

// Define response types
interface EVMBlockResponse {
  result: {
    timestamp: string;
  } | null;
}

interface LatestBlockNumberResponse {
  result: string;
}

// Generic function to get cached data
async function getCachedData<T>(
  cache: Record<number, T>,
  key: number,
  fetchFunc: () => Promise<T>
): Promise<T> {
  return retry(async () => {
    if (key in cache) return cache[key];
    const data = await fetchFunc();
    cache[key] = data;
    return data;
  });
}

// EVM Functions

// Function to get block timestamp for EVM with caching
export async function getBlockTimestamp(blockNumber: number): Promise<number> {
  return getCachedData(blockTimestampCache, blockNumber, async () => {
    const response = await fetch(EVM_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: [`0x${blockNumber.toString(16)}`, false],
        id: 1,
      }),
    });
    const data: EVMBlockResponse = await response.json();
    if (!data.result)
      throw new Error(`No data found for block number: ${blockNumber}`);
    return parseInt(data.result.timestamp, 16);
  });
}

// Function to get the latest block number (EVM)
export async function getLatestBlockNumber(): Promise<number> {
  const response = await fetch(EVM_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_blockNumber",
      params: [],
      id: 1,
    }),
  });
  const data: LatestBlockNumberResponse = await response.json();
  return parseInt(data.result, 16);
}

// Function to get EVM block by timestamp (binary search)
export async function getEVMBlockByTimestamp(
  timestamp: number
): Promise<number> {
  const latestBlock = await getLatestBlockNumber();
  let startBlock = 0;
  let endBlock = latestBlock;
  let closestBlock = 0;
  let closestTimeDifference = Number.MAX_SAFE_INTEGER;

  while (startBlock <= endBlock) {
    const middleBlock = Math.floor((startBlock + endBlock) / 2);
    const middleBlockTime = await getBlockTimestamp(middleBlock);
    const timeDifference = Math.abs(middleBlockTime - timestamp);

    if (timeDifference < closestTimeDifference) {
      closestBlock = middleBlock;
      closestTimeDifference = timeDifference;
    }

    if (middleBlockTime === timestamp) {
      return middleBlock;
    } else if (middleBlockTime < timestamp) {
      startBlock = middleBlock + 1;
    } else {
      endBlock = middleBlock - 1;
    }
  }

  return closestBlock;
}

// Solana Functions

// Function to get the latest slot number (Solana)
export async function getLatestSlot(): Promise<number> {
  const response = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "getSlot",
      params: [],
      id: 1,
    }),
  });
  const data = (await response.json()) as { result: number };
  return data.result;
}

// Function to get slot time from Solana with caching
export async function getCachedSlotTime(slot: number): Promise<number> {
  return getCachedData(slotTimeCache, slot, async () => {
    return await getSlotTime(slot);
  });
}

// Function to get slot time from Solana
export async function getSlotTime(slot: number): Promise<number> {
  const response = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "getBlockTime",
      params: [slot],
      id: 1,
    }),
  });
  const data = (await response.json()) as { result: number | null };
  if (data.result === null)
    throw new Error(`No timestamp found for slot ${slot}`);
  return data.result;
}

// Function to get block number for Solana by timestamp
export async function getSolanaBlockByTimestamp(
  timestamp: number
): Promise<number> {
  const latestSlot = await getLatestSlot();
  const genesisTimestamp = await getCachedSlotTime(0);

  if (timestamp <= genesisTimestamp) return 0;

  let startSlot = 0;
  let endSlot = latestSlot;
  let closestSlot = 0;
  let closestTimeDifference = Number.MAX_SAFE_INTEGER;

  while (startSlot <= endSlot) {
    const middleSlot = Math.floor((startSlot + endSlot) / 2);
    const middleSlotTime = await getCachedSlotTime(middleSlot);
    const timeDifference = Math.abs(middleSlotTime - timestamp);

    if (timeDifference < closestTimeDifference) {
      closestSlot = middleSlot;
      closestTimeDifference = timeDifference;
    }

    if (middleSlotTime === timestamp) {
      return middleSlot;
    } else if (middleSlotTime < timestamp) {
      startSlot = middleSlot + 1;
    } else {
      endSlot = middleSlot - 1;
    }
  }

  return await refineSlotSearchSolana(closestSlot, timestamp);
}

// Function to refine slot search for Solana
async function refineSlotSearchSolana(
  initialSlot: number,
  targetTimestamp: number
): Promise<number> {
  let closestSlot = initialSlot;
  let closestTimeDifference = Math.abs(
    (await getCachedSlotTime(initialSlot)) - targetTimestamp
  );

  for (let offset = 1; offset <= MAX_SEARCH_OFFSET; offset++) {
    const forwardSlot = initialSlot + offset;
    const backwardSlot = initialSlot - offset;

    const forwardTime = await getCachedSlotTime(forwardSlot);
    const forwardDifference = Math.abs(forwardTime - targetTimestamp);
    if (forwardDifference < closestTimeDifference) {
      closestSlot = forwardSlot;
      closestTimeDifference = forwardDifference;
    }

    const backwardTime = await getCachedSlotTime(backwardSlot);
    const backwardDifference = Math.abs(backwardTime - targetTimestamp);
    if (backwardDifference < closestTimeDifference) {
      closestSlot = backwardSlot;
      closestTimeDifference = backwardDifference;
    }

    if (closestTimeDifference <= TIME_DIFFERENCE_THRESHOLD) break;
  }

  return closestSlot;
}

// Function to get timestamp by block number (EVM)
export async function getTimestampByBlockNumber(
  blockNumber: number
): Promise<number> {
  return getBlockTimestamp(blockNumber);
}

// Function to get timestamp by slot number (Solana)
export async function getTimestampBySlot(slot: number): Promise<number> {
  const latestSlot = await getLatestSlot();
  if (slot < 0 || slot > latestSlot) {
    throw new Error(
      `Slot ${slot} is out of range. Latest slot is ${latestSlot}.`
    );
  }
  return getCachedSlotTime(slot);
}
