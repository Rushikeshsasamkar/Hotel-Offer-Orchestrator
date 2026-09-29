import { TestWorkflowEnvironment } from '@temporalio/testing';
import { DefaultLogger, Runtime, Worker } from '@temporalio/worker';
import { WorkflowFailedError, ApplicationFailure } from '@temporalio/client';
import type { HotelOffer, SupplierHotel } from '../src/types';
import type { hotelOffersWorkflow } from '../src/temporal/workflows';

let env: TestWorkflowEnvironment;

Runtime.install({ logger: new DefaultLogger('ERROR') });

beforeAll(async () => {
  env = await TestWorkflowEnvironment.createTimeSkipping();
}, 120000);
afterAll(async () => {
  await env?.teardown();
});

const A: SupplierHotel[] = [{ name: 'Taj', price: 100, commissionPct: 10 }, { name: 'OnlyA', price: 50, commissionPct: 5 }];
const B: SupplierHotel[] = [{ name: 'taj ', price: 90, commissionPct: 8 }];

async function run(
  opts: { failA?: boolean; failB?: boolean },
  input: { city: string; simulateFailure?: 'supplierA' | 'supplierB' | 'both' } = { city: 'delhi' },
) {
  const saved: HotelOffer[][] = [];
  const calls = { a: 0, b: 0 };
  const worker = await Worker.create({
    connection: env.nativeConnection,
    taskQueue: 'test',
    workflowsPath: require.resolve('../src/temporal/workflows'),
    activities: {
      fetchSupplierA: async () => {
        calls.a++;
        if (opts.failA) throw new Error('A down');
        return A;
      },
      fetchSupplierB: async () => {
        calls.b++;
        if (opts.failB) throw new Error('B down');
        return B;
      },
      saveHotelsToRedis: async (_city: string, offers: HotelOffer[]) => {
        saved.push(offers);
      },
    },
  });
  const result = worker.runUntil(
    env.client.workflow.execute<typeof hotelOffersWorkflow>('hotelOffersWorkflow', {
      taskQueue: 'test',
      workflowId: `wf-${Math.random()}`,
      args: [input],
    }),
  );
  return { result, saved, calls };
}

describe('hotelOffersWorkflow', () => {
  it('both suppliers ok -> deduped and saved', async () => {
    const { result, saved } = await run({});
    const out = await result;
    expect(out.failedSuppliers).toEqual([]);
    expect(out.offers.map((o) => [o.name, o.price, o.supplier])).toEqual([
      ['OnlyA', 50, 'Supplier A'],
      ['taj', 90, 'Supplier B'],
    ]);
    expect(saved).toHaveLength(1);
  });

  it('one supplier down -> partial result after retries', async () => {
    const { result, calls, saved } = await run({ failA: true });
    const out = await result;
    expect(out.failedSuppliers).toEqual(['supplierA']);
    expect(out.offers.every((o) => o.supplier === 'Supplier B')).toBe(true);
    expect(calls.a).toBe(3);
    expect(saved).toHaveLength(1);
  });

  it('both down -> non-retryable AllSuppliersDown failure, nothing saved', async () => {
    const { result, saved } = await run({ failA: true, failB: true });
    const err = await result.catch((e) => e);
    expect(err).toBeInstanceOf(WorkflowFailedError);
    expect(err.cause).toBeInstanceOf(ApplicationFailure);
    expect((err.cause as ApplicationFailure).type).toBe('AllSuppliersDown');
    expect(saved).toHaveLength(0);
  });
});
