import { logger } from './logger';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry fn until it succeeds; throws the last error after maxAttempts. */
export async function retry<T>(fn: () => Promise<T>, maxAttempts = 30, delayMs = 2000): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      logger.warn({ attempt, err: (err as Error).message }, 'temporal not ready, retrying');
      await sleep(delayMs);
    }
  }
}
