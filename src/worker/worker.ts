import { NativeConnection, Worker } from '@temporalio/worker';
import { config } from '../config';
import { logger } from '../logger';
import * as activities from '../temporal/activities';
import { closeRedis } from '../redis/client';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function connect(maxAttempts = 30, delayMs = 2000): Promise<NativeConnection> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await NativeConnection.connect({ address: config.temporalAddress });
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      logger.warn({ attempt, err: (err as Error).message }, 'temporal not ready, retrying');
      await sleep(delayMs);
    }
  }
}

async function main(): Promise<void> {
  const connection = await connect();
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
