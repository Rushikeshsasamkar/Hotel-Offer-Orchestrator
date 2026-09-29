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

describe('hotelStore (real Redis)', () => {
  it('saves and queries with price bounds', async () => {
    if (!redis) return;
    await saveOffers(redis, city, [o('A', 100), o('B', 200), o('C', 300)], 60);
    expect((await queryOffers(redis, city)).map((x) => x.name)).toEqual(['A', 'B', 'C']);
    expect((await queryOffers(redis, city, 150, 300)).map((x) => x.name)).toEqual(['B', 'C']);
    expect((await queryOffers(redis, city, undefined, 100)).map((x) => x.name)).toEqual(['A']);
    expect((await queryOffers(redis, city, 200)).map((x) => x.name)).toEqual(['B', 'C']);
    expect(await redis.ttl(hotelKey(city))).toBeGreaterThan(0);
  });

  it('replaces the previous set atomically, and empty list clears it', async () => {
    if (!redis) return;
    await saveOffers(redis, city, [o('A', 100)], 60);
    await saveOffers(redis, city, [o('Z', 999)], 60);
    expect((await queryOffers(redis, city)).map((x) => x.name)).toEqual(['Z']);
    await saveOffers(redis, city, [], 60);
    expect(await queryOffers(redis, city)).toEqual([]);
  });
});
