import { config } from '../config';
import { logger } from '../logger';
import { closeRedis } from '../redis/client';
import { closeTemporal, connectTemporal } from '../temporal/client';
import { createApp } from './app';

async function main(): Promise<void> {
  await connectTemporal();
  const server = createApp().listen(config.port, () => logger.info({ port: config.port }, 'api listening'));
  const shutdown = (): void => {
    logger.info('shutting down api');
    server.close(async () => {
      await Promise.allSettled([closeTemporal(), closeRedis()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error({ err: (err as Error).message }, 'api failed to start');
  process.exit(1);
});
