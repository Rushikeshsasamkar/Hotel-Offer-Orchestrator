// Workflow code runs in a deterministic sandbox: import ONLY from @temporalio/workflow,
// types, and the pure dedupe module. No I/O, no node built-ins, no logger/config.
import { ApplicationFailure, log, proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';
import { selectBestOffers } from '../domain/dedupe';
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
  await saveHotelsToRedis(city, offers);
  log.info('Offers saved', { city, count: offers.length });
  return { offers, failedSuppliers };
}
