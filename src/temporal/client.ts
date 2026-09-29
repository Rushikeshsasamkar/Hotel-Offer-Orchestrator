import { Client, Connection } from '@temporalio/client';
import { config } from '../config';
import { logger } from '../logger';
import { retry } from '../retry';

let connection: Connection | undefined;
let client: Client | undefined;

/** Connect with retry (Temporal can take several seconds to boot). */
export async function connectTemporal(maxAttempts = 30, delayMs = 2000): Promise<Client> {
  connection = await retry(
    () => Connection.connect({ address: config.temporalAddress, connectTimeout: 5000 }),
    maxAttempts,
    delayMs,
  );
  client = new Client({ connection });
  logger.info({ address: config.temporalAddress }, 'connected to temporal');
  return client;
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
