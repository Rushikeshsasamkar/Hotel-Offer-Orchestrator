import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../logger';

let client: Redis | undefined;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(config.redisUrl, { maxRetriesPerRequest: 3 });
    client.on('error', (err) => logger.error({ err: err.message }, 'redis error'));
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    const c = client;
    client = undefined;
    await c.quit().catch(() => c.disconnect());
  }
}
