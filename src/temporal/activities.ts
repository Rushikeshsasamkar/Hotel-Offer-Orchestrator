import { z } from 'zod';
import { config } from '../config';
import { logger } from '../logger';
import { getRedis } from '../redis/client';
import { hotelKey, saveOffers } from '../redis/hotelStore';
import type { HotelOffer, SupplierHotel, SupplierKey } from '../types';

const payloadSchema = z.array(
  z.object({
    hotelId: z.string().min(1),
    name: z.string().min(1),
    price: z.number().finite().nonnegative(),
    city: z.string().min(1),
    commissionPct: z.number().finite().nonnegative(),
  }),
);

const FETCH_TIMEOUT_MS = 3000;

async function fetchSupplier(path: SupplierKey, city: string, fail: boolean): Promise<SupplierHotel[]> {
  const url = new URL(`${config.supplierBaseUrl}/${path}/hotels`);
  url.searchParams.set('city', city);
  if (fail) url.searchParams.set('fail', 'true');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    logger.info({ supplier: path, city }, 'fetching supplier');
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${path} responded ${res.status}`);
    const hotels = payloadSchema.parse(await res.json());
    logger.info({ supplier: path, city, count: hotels.length }, 'supplier fetched');
    return hotels;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSupplierA(city: string, fail = false): Promise<SupplierHotel[]> {
  return fetchSupplier('supplierA', city, fail);
}

export async function fetchSupplierB(city: string, fail = false): Promise<SupplierHotel[]> {
  return fetchSupplier('supplierB', city, fail);
}

/** TTL for request-scoped partial-result keys (canonical keys use CACHE_TTL_SECONDS). */
const PARTIAL_TTL_SECONDS = 60;

/** The workflow chooses `key`: canonical for full results, request-scoped for partial ones. */
export async function saveHotelsToRedis(city: string, offers: HotelOffer[], key: string): Promise<void> {
  const ttl = key === hotelKey(city) ? config.cacheTtlSeconds : PARTIAL_TTL_SECONDS;
  await saveOffers(getRedis(), key, offers, ttl);
  logger.info({ city, key, ttl, count: offers.length }, 'offers saved to redis');
}
