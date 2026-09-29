import type Redis from 'ioredis';
import type { HotelOffer } from '../types';

export { hotelKey, partialHotelKey } from '../domain/keys';

/** Atomically replace the offer set at `key`: MULTI DEL, ZADD*, EXPIRE, EXEC. */
export async function saveOffers(
  redis: Redis,
  key: string,
  offers: HotelOffer[],
  ttlSeconds: number,
): Promise<void> {
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
export async function queryOffers(redis: Redis, key: string, min?: number, max?: number): Promise<HotelOffer[]> {
  const members = await redis.zrangebyscore(
    key,
    min === undefined ? '-inf' : String(min),
    max === undefined ? '+inf' : String(max),
  );
  return members.map((m) => JSON.parse(m) as HotelOffer);
}
