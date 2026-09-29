import type Redis from 'ioredis';
import type { HotelOffer } from '../types';

export const hotelKey = (city: string): string => `hotels:${city.trim().toLowerCase()}`;

/** Atomically replace the offer set for a city: MULTI DEL, ZADD*, EXPIRE, EXEC. */
export async function saveOffers(
  redis: Redis,
  city: string,
  offers: HotelOffer[],
  ttlSeconds: number,
): Promise<void> {
  const key = hotelKey(city);
  const tx = redis.multi().del(key);
  if (offers.length > 0) {
    for (const o of offers) tx.zadd(key, o.price, JSON.stringify(o));
    tx.expire(key, ttlSeconds);
  }
  const res = await tx.exec();
  const failed = res?.find(([err]) => err);
  if (!res || failed) throw new Error(`redis transaction failed: ${failed?.[0]?.message ?? 'aborted'}`);
}

/** Price-range query executed inside Redis via ZRANGEBYSCORE (inclusive bounds). */
export async function queryOffers(
  redis: Redis,
  city: string,
  min?: number,
  max?: number,
): Promise<HotelOffer[]> {
  const members = await redis.zrangebyscore(
    hotelKey(city),
    min === undefined ? '-inf' : String(min),
    max === undefined ? '+inf' : String(max),
  );
  return members.map((m) => JSON.parse(m) as HotelOffer);
}
