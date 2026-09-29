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

const A: SupplierHotel[] = [
  { hotelId: 'a1', city: 'delhi', name: 'Taj', price: 100, commissionPct: 10 },
  { hotelId: 'a2', city: 'delhi', name: 'OnlyA', price: 50, commissionPct: 5 },
];
const B: SupplierHotel[] = [{ hotelId: 'b1', city: 'delhi', name: 'taj ', price: 90, commissionPct: 8 }];

async function run(
  opts: { failA?: boolean; failB?: boolean },
  input: { city: string; simulateFailure?: 'supplierA' | 'supplierB' | 'both' } = { city: 'delhi' },
) {
  const saved: { offers: HotelOffer[]; key: string }[] = [];
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
      saveHotelsToRedis: async (_city: string, offers: HotelOffer[], key: string) => {
        saved.push({ offers, key });
      },
    },
  });
  const workflowId = `wf-${Math.random()}`;
  const result = worker.runUntil(
    env.client.workflow.execute<typeof hotelOffersWorkflow>('hotelOffersWorkflow', {
      taskQueue: 'test',
      workflowId,
      args: [input],
    }),
  );
  return { result, saved, calls, workflowId };
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
    expect(out.redisKey).toBe('hotels:delhi');
    expect(saved[0].key).toBe('hotels:delhi');
  });

  it('one supplier down -> partial result after retries, saved to request-scoped key only', async () => {
    const { result, calls, saved, workflowId } = await run({ failA: true });
    const out = await result;
    expect(out.failedSuppliers).toEqual(['supplierA']);
    expect(out.offers.every((o) => o.supplier === 'Supplier B')).toBe(true);
    expect(calls.a).toBe(3);
    expect(saved).toHaveLength(1);
    expect(out.redisKey).toBe(`hotels:delhi:partial:${workflowId}`);
    expect(saved.map((s) => s.key)).toEqual([`hotels:delhi:partial:${workflowId}`]);
    expect(saved.some((s) => s.key === 'hotels:delhi')).toBe(false);
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
