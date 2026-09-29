import type { HotelOffer, SupplierHotel, SupplierName } from '../types';

const keyOf = (name: string): string => name.trim().toLowerCase();

/** true when `cand` should replace `cur` (cheaper; tie -> higher commission; full tie -> keep current). */
function beats(cand: HotelOffer, cur: HotelOffer): boolean {
  if (cand.price !== cur.price) return cand.price < cur.price;
  return cand.commissionPct > cur.commissionPct;
}

/**
 * Merge two supplier lists into one offer per hotel.
 * Rules: cheaper price wins; tie -> higher commissionPct; still tied -> Supplier A.
 * Supplier A is processed first and a candidate must strictly beat the incumbent,
 * so the full-tie case deterministically resolves to Supplier A.
 * Pure and deterministic (safe for use inside a Temporal workflow).
 */
export function selectBestOffers(a: SupplierHotel[], b: SupplierHotel[]): HotelOffer[] {
  const best = new Map<string, HotelOffer>();
  const consume = (list: SupplierHotel[], supplier: SupplierName): void => {
    for (const h of list) {
      const offer: HotelOffer = {
        name: h.name.trim(),
        price: h.price,
        supplier,
        commissionPct: h.commissionPct,
      };
      const k = keyOf(h.name);
      const cur = best.get(k);
      if (!cur || beats(offer, cur)) best.set(k, offer);
    }
  };
  consume(a, 'Supplier A');
  consume(b, 'Supplier B');
  return [...best.values()].sort((x, y) => x.price - y.price || x.name.localeCompare(y.name));
}
