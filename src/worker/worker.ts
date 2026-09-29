import { NativeConnection, Worker } from '@temporalio/worker';
import { config } from '../config';
import { logger } from '../logger';
import * as activities from '../temporal/activities';
import { closeRedis } from '../redis/client';
import { retry } from '../retry';

async function main(): Promise<void> {
  const connection = await retry(() => NativeConnection.connect({ address: config.temporalAddress }));
  const worker = await Worker.create({
    connection,
    taskQueue: config.taskQueue,
    // Resolves to compiled JS under dist/ when running the built app (and .ts under tsx).
    workflowsPath: require.resolve('../temporal/workflows'),
    activities,
  });
  const shutdown = (): void => {
    logger.info('shutting down worker');
    worker.shutdown();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  logger.info({ taskQueue: config.taskQueue }, 'worker started');
  await worker.run();
  await connection.close();
  await closeRedis();
}

main().catch((err) => {
  logger.error({ err: (err as Error).message }, 'worker failed');
  process.exit(1);
});
