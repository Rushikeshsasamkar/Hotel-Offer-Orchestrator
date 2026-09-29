import { randomUUID } from 'node:crypto';
import { ApplicationFailure, WorkflowFailedError } from '@temporalio/client';
import { config } from '../config';
import { getRedis } from '../redis/client';
import { queryOffers } from '../redis/hotelStore';
import { checkTemporal, getTemporalClient } from '../temporal/client';
import type { HotelOffer, WorkflowInput, WorkflowOutput } from '../types';

export class AllSuppliersDownError extends Error {
  constructor() {
    super('All suppliers unavailable');
  }
}
export class TemporalUnavailableError extends Error {}

export interface Deps {
  runWorkflow(input: WorkflowInput): Promise<WorkflowOutput>;
  queryOffers(redisKey: string, min?: number, max?: number): Promise<HotelOffer[]>;
  pingRedis(): Promise<void>;
  checkTemporal(): Promise<void>;
}

export const defaultDeps: Deps = {
  async runWorkflow(input) {
    let timer: NodeJS.Timeout | undefined;
    // The deadline covers start() too: with Temporal unreachable, start() itself hangs.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new TemporalUnavailableError('workflow timed out')),
        config.workflowTimeoutMs,
      );
    });
    try {
      const run = async () => {
        const handle = await getTemporalClient().workflow.start('hotelOffersWorkflow', {
          taskQueue: config.taskQueue,
          workflowId: `hotels-${input.city}-${randomUUID()}`,
          args: [input],
          workflowExecutionTimeout: '30s',
        });
        return (await handle.result()) as WorkflowOutput;
      };
      return await Promise.race([run(), timeout]);
    } catch (err) {
      if (err instanceof TemporalUnavailableError) throw err;
      if (
        err instanceof WorkflowFailedError &&
        err.cause instanceof ApplicationFailure &&
        err.cause.type === 'AllSuppliersDown'
      ) {
        throw new AllSuppliersDownError();
      }
      throw new TemporalUnavailableError((err as Error).message);
    } finally {
      clearTimeout(timer);
    }
  },
  queryOffers: (redisKey, min, max) => queryOffers(getRedis(), redisKey, min, max),
  async pingRedis() {
    await getRedis().ping();
  },
  checkTemporal,
};
