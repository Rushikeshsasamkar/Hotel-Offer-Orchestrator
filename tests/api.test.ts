import request from 'supertest';
import { createApp } from '../src/api/app';
import { AllSuppliersDownError, TemporalUnavailableError, type Deps } from '../src/api/deps';
import { hotelKey, partialHotelKey } from '../src/redis/hotelStore';
import type { HotelOffer } from '../src/types';

const offers: HotelOffer[] = [{ name: 'X', price: 5500, supplier: 'Supplier B', commissionPct: 10 }];

function deps(over: Partial<Deps> = {}): Deps {
  return {
    runWorkflow: jest.fn().mockResolvedValue({ offers, failedSuppliers: [], redisKey: 'hotels:delhi' }),
    queryOffers: jest.fn().mockResolvedValue(offers),
    pingRedis: jest.fn().mockResolvedValue(undefined),
    checkTemporal: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('GET /api/hotels', () => {
  it('returns offers from redis, normalising city and passing price bounds', async () => {
    const d = deps();
    const res = await request(createApp(d)).get('/api/hotels?city=%20Delhi%20&minPrice=5000&maxPrice=6000');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(offers);
    expect(d.runWorkflow).toHaveBeenCalledWith({ city: 'delhi', simulateFailure: undefined });
    expect(d.queryOffers).toHaveBeenCalledWith('hotels:delhi', 5000, 6000);
    expect(res.headers['x-partial-results']).toBeUndefined();
  });

  it.each([
    ['/api/hotels'],
    ['/api/hotels?city='],
    ['/api/hotels?city=delhi&minPrice=9000&maxPrice=100'],
    ['/api/hotels?city=delhi&minPrice=abc'],
    ['/api/hotels?city=delhi&maxPrice=-5'],
    ['/api/hotels?city=delhi&simulateFailure=nope'],
  ])('400 for %s', async (url) => {
    const d = deps();
    const res = await request(createApp(d)).get(url);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
    expect(d.runWorkflow).not.toHaveBeenCalled();
  });

  it('sets X-Partial-Results when one supplier failed', async () => {
    const d = deps({ runWorkflow: jest.fn().mockResolvedValue({ offers, failedSuppliers: ['supplierA'], redisKey: 'hotels:delhi:partial:wf-1' }) });
    const res = await request(createApp(d)).get('/api/hotels?city=delhi&simulateFailure=supplierA');
    expect(res.status).toBe(200);
    expect(res.headers['x-partial-results']).toBe('supplierA');
    expect(d.runWorkflow).toHaveBeenCalledWith({ city: 'delhi', simulateFailure: 'supplierA' });
  });

  it('queries the redis key returned by the workflow, not the canonical city key', async () => {
    const redisKey = 'hotels:delhi:partial:wf-42';
    const d = deps({
      runWorkflow: jest.fn().mockResolvedValue({ offers, failedSuppliers: ['supplierA'], redisKey }),
    });
    await request(createApp(d)).get('/api/hotels?city=delhi&minPrice=1&simulateFailure=supplierA');
    expect(d.queryOffers).toHaveBeenCalledTimes(1);
    expect(d.queryOffers).toHaveBeenCalledWith(redisKey, 1, undefined);
  });

  it('502 when all suppliers are down', async () => {
    const d = deps({ runWorkflow: jest.fn().mockRejectedValue(new AllSuppliersDownError()) });
    const res = await request(createApp(d)).get('/api/hotels?city=delhi&simulateFailure=both');
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'All suppliers unavailable' });
  });

  it('503 when temporal is unavailable', async () => {
    const d = deps({ runWorkflow: jest.fn().mockRejectedValue(new TemporalUnavailableError('down')) });
    const res = await request(createApp(d)).get('/api/hotels?city=delhi');
    expect(res.status).toBe(503);
  });

  it('200 [] for a city with no results', async () => {
    const d = deps({ queryOffers: jest.fn().mockResolvedValue([]) });
    const res = await request(createApp(d)).get('/api/hotels?city=atlantis');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('partial-result isolation', () => {
  it('a partial request leaves the canonical hotels:delhi key intact', async () => {
    const store = new Map<string, HotelOffer[]>([[hotelKey('delhi'), offers]]);
    const partialOffers: HotelOffer[] = [{ name: 'PartialOnly', price: 1, supplier: 'Supplier B', commissionPct: 1 }];
    let n = 0;
    const d = deps({
      runWorkflow: jest.fn().mockImplementation(async ({ city, simulateFailure }) => {
        if (!simulateFailure) {
          store.set(hotelKey(city), offers);
          return { offers, failedSuppliers: [], redisKey: hotelKey(city) };
        }
        const redisKey = partialHotelKey(city, `wf-${++n}`);
        store.set(redisKey, partialOffers);
        return { offers: partialOffers, failedSuppliers: ['supplierA'], redisKey };
      }),
      queryOffers: jest.fn().mockImplementation(async (key: string) => store.get(key) ?? []),
    });
    const app = createApp(d);
    const partial = await request(app).get('/api/hotels?city=delhi&simulateFailure=supplierA');
    expect(partial.body).toEqual(partialOffers);
    expect(store.get('hotels:delhi')).toEqual(offers);
    expect(store.has('hotels:delhi:partial:wf-1')).toBe(true);
    const real = await request(app).get('/api/hotels?city=delhi');
    expect(real.body).toEqual(offers);
  });
});

describe('mock suppliers', () => {
  it('filters by city and supports fail=true', async () => {
    const app = createApp(deps());
    const a = await request(app).get('/supplierA/hotels?city=Delhi');
    expect(a.status).toBe(200);
    expect(a.body.length).toBeGreaterThanOrEqual(5);
    expect(a.body[0]).toEqual(expect.objectContaining({ hotelId: expect.stringMatching(/^a/), city: 'delhi' }));
    expect((await request(app).get('/supplierB/hotels?city=atlantis')).body).toEqual([]);
    expect((await request(app).get('/supplierB/hotels?city=delhi&fail=true')).status).toBe(503);
  });
});

describe('GET /health', () => {
  it('503 degraded when a dependency is down', async () => {
    const d = deps({ pingRedis: jest.fn().mockRejectedValue(new Error('nope')) });
    const res = await request(createApp(d)).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.redis.status).toBe('down');
    expect(res.body.suppliers).toHaveProperty('supplierA');
    expect(res.body.suppliers).toHaveProperty('supplierB');
  });
});
