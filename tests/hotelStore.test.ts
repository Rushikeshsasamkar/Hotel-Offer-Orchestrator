import Redis from 'ioredis';
import { hotelKey, queryOffers, saveOffers } from '../src/redis/hotelStore';
import type { HotelOffer } from '../src/types';

const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
let redis: Redis | undefined;

const o = (name: string, price: number): HotelOffer => ({ name, price, supplier: 'Supplier A', commissionPct: 10 });
const city = `testcity-${process.pid}`;

beforeAll(async () => {
  const r = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null });
  r.on('error', () => undefined);
  try {
    await r.connect();
    await r.ping();
    redis = r;
  } catch {
    r.disconnect();
    console.warn(`Redis not reachable at ${url}; skipping hotelStore tests`);
  }
});

afterAll(async () => {
  if (redis) {
    await redis.del(hotelKey(city));
    await redis.quit();
  }
});

describe('hotelKey', () => {
  it('derives the canonical key', () => {
    expect(hotelKey(' Delhi ')).toBe('hotels:delhi');
  });
});

describe('hotelStore (real Redis)', () => {
  it('writes to a request-scoped key never touch the canonical key', async () => {
    if (!redis) return;
    const partial = `${hotelKey(city)}:partial:wf-1`;
    await saveOffers(redis, hotelKey(city), [o('Real', 100)], 60);
    await saveOffers(redis, partial, [o('Partial', 1)], 60);
    expect((await queryOffers(redis, hotelKey(city))).map((x) => x.name)).toEqual(['Real']);
    expect((await queryOffers(redis, partial)).map((x) => x.name)).toEqual(['Partial']);
    await redis.del(partial);
  });

  it('saves and queries with price bounds', async () => {
    if (!redis) return;
    await saveOffers(redis, hotelKey(city), [o('A', 100), o('B', 200), o('C', 300)], 60);
    expect((await queryOffers(redis, hotelKey(city))).map((x) => x.name)).toEqual(['A', 'B', 'C']);
    expect((await queryOffers(redis, hotelKey(city), 150, 300)).map((x) => x.name)).toEqual(['B', 'C']);
    expect((await queryOffers(redis, hotelKey(city), undefined, 100)).map((x) => x.name)).toEqual(['A']);
    expect((await queryOffers(redis, hotelKey(city), 200)).map((x) => x.name)).toEqual(['B', 'C']);
    expect(await redis.ttl(hotelKey(city))).toBeGreaterThan(0);
  });

  it('replaces the previous set atomically, and empty list clears it', async () => {
    if (!redis) return;
    await saveOffers(redis, hotelKey(city), [o('A', 100)], 60);
    await saveOffers(redis, hotelKey(city), [o('Z', 999)], 60);
    expect((await queryOffers(redis, hotelKey(city))).map((x) => x.name)).toEqual(['Z']);
    await saveOffers(redis, hotelKey(city), [], 60);
    expect(await queryOffers(redis, hotelKey(city))).toEqual([]);
  });
});
