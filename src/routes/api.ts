import type { Context } from "hono";
import {
  getEVMBlockByTimestamp,
  getSolanaBlockByTimestamp,
  getTimestampByBlockNumber,
  getTimestampBySlot,
} from "../utils/block-fetcher";

const cache: Record<string, Record<string, number>> = {};

export async function handleApiRoute(c: Context) {
  const timestampsParam = c.req.query("timestamps");
  const blockNumberParam = c.req.query("blockNumber");
  const chain = c.req.query("chain") || "evm";
  const results: Record<string, number | null> = {};

  if (timestampsParam) {
    const timestamps = timestampsParam.split(",").map((ts) => ts.trim());
    for (const timestamp of timestamps) {
      if (cache[chain] && cache[chain][timestamp]) {
        results[timestamp] = cache[chain][timestamp];
      } else {
        try {
          const blockNumber = chain === "solana"
            ? await getSolanaBlockByTimestamp(Number(timestamp))
            : await getEVMBlockByTimestamp(Number(timestamp));

          if (!cache[chain]) cache[chain] = {};
          cache[chain][timestamp] = blockNumber;
          results[timestamp] = blockNumber;

          console.log(`Chain: ${chain}, Block number: ${blockNumber}, Timestamp: ${timestamp}`);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`Failed to fetch block for timestamp ${timestamp} on chain ${chain}: ${errorMessage}`);
          results[timestamp] = null;
        }
      }
    }
  } else if (blockNumberParam) {
    try {
      const blockNumber = Number(blockNumberParam);
      const timestamp = chain === "solana"
        ? await getTimestampBySlot(blockNumber)
        : await getTimestampByBlockNumber(blockNumber);

      results[blockNumberParam] = timestamp;
      console.log(`Chain: ${chain}, Block number: ${blockNumber}, Timestamp: ${timestamp}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error fetching timestamp for block number ${blockNumberParam} on chain ${chain}: ${errorMessage}`);
      return c.text(`Error: ${errorMessage}`, 500);
    }
  } else {
    return c.json({ error: "No timestamps or block number provided" }, 400);
  }

  return c.json(results);
}
