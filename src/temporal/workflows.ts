// Workflow code runs in a deterministic sandbox: import ONLY from @temporalio/workflow,
// types, and the pure domain modules. No I/O, no node built-ins, no logger/config.
import { ApplicationFailure, log, proxyActivities, workflowInfo } from '@temporalio/workflow';
import type * as activities from './activities';
import { selectBestOffers } from '../domain/dedupe';
import { hotelKey, partialHotelKey } from '../domain/keys';
import type { SupplierKey, WorkflowInput, WorkflowOutput } from '../types';

const { fetchSupplierA, fetchSupplierB, saveHotelsToRedis } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5s',
  retry: { maximumAttempts: 3, initialInterval: '200ms', backoffCoefficient: 2 },
});

export async function hotelOffersWorkflow(input: WorkflowInput): Promise<WorkflowOutput> {
  const { city, simulateFailure } = input;
  const failA = simulateFailure === 'supplierA' || simulateFailure === 'both';
  const failB = simulateFailure === 'supplierB' || simulateFailure === 'both';

  const [a, b] = await Promise.allSettled([fetchSupplierA(city, failA), fetchSupplierB(city, failB)]);

  const failedSuppliers: SupplierKey[] = [];
  if (a.status === 'rejected') failedSuppliers.push('supplierA');
  if (b.status === 'rejected') failedSuppliers.push('supplierB');

  if (a.status === 'rejected' && b.status === 'rejected') {
    log.error('All suppliers unavailable', { city });
    throw ApplicationFailure.nonRetryable('All suppliers unavailable', 'AllSuppliersDown');
  }
  if (failedSuppliers.length > 0) log.warn('Partial supplier failure', { city, failedSuppliers });

  const offers = selectBestOffers(
    a.status === 'fulfilled' ? a.value : [],
    b.status === 'fulfilled' ? b.value : [],
  );
  // Full results own the canonical key; partial results must never overwrite it, so they go to a
  // request-scoped key (short TTL) that only this request reads.
  const redisKey = failedSuppliers.length === 0 ? hotelKey(city) : partialHotelKey(city, workflowInfo().workflowId);
  await saveHotelsToRedis(city, offers, redisKey);
  log.info('Offers saved', { city, redisKey, count: offers.length });
  return { offers, failedSuppliers, redisKey };
}
