import { Client, Connection } from '@temporalio/client';
import { config } from '../config';
import { logger } from '../logger';

let connection: Connection | undefined;
let client: Client | undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Connect with retry (Temporal can take several seconds to boot). */
export async function connectTemporal(maxAttempts = 30, delayMs = 2000): Promise<Client> {
  for (let attempt = 1; ; attempt++) {
    try {
      connection = await Connection.connect({ address: config.temporalAddress, connectTimeout: 5000 });
      client = new Client({ connection });
      logger.info({ address: config.temporalAddress }, 'connected to temporal');
      return client;
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      logger.warn({ attempt, err: (err as Error).message }, 'temporal not ready, retrying');
      await sleep(delayMs);
    }
  }
}

export function getTemporalClient(): Client {
  if (!client) throw new Error('Temporal client not initialised');
  return client;
}

export async function checkTemporal(): Promise<void> {
  if (!connection) throw new Error('not connected');
  const c = connection;
  await c.withDeadline(Date.now() + 2000, () => c.workflowService.getSystemInfo({}));
}

export async function closeTemporal(): Promise<void> {
  await connection?.close();
  connection = undefined;
  client = undefined;
}
