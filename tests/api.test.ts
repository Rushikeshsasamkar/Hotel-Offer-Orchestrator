import request from 'supertest';
import { createApp } from '../src/api/app';
import { AllSuppliersDownError, TemporalUnavailableError, type Deps } from '../src/api/deps';
import type { HotelOffer } from '../src/types';

const offers: HotelOffer[] = [{ name: 'X', price: 5500, supplier: 'Supplier B', commissionPct: 10 }];

function deps(over: Partial<Deps> = {}): Deps {
  return {
    runWorkflow: jest.fn().mockResolvedValue({ offers, failedSuppliers: [] }),
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
    expect(d.queryOffers).toHaveBeenCalledWith('delhi', 5000, 6000);
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
    const d = deps({ runWorkflow: jest.fn().mockResolvedValue({ offers, failedSuppliers: ['supplierA'] }) });
    const res = await request(createApp(d)).get('/api/hotels?city=delhi&simulateFailure=supplierA');
    expect(res.status).toBe(200);
    expect(res.headers['x-partial-results']).toBe('supplierA');
    expect(d.runWorkflow).toHaveBeenCalledWith({ city: 'delhi', simulateFailure: 'supplierA' });
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

describe('mock suppliers', () => {
  it('filters by city and supports fail=true', async () => {
    const app = createApp(deps());
    const a = await request(app).get('/supplierA/hotels?city=Delhi');
    expect(a.status).toBe(200);
    expect(a.body.length).toBeGreaterThanOrEqual(5);
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
