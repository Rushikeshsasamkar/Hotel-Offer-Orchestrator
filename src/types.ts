export type SupplierName = 'Supplier A' | 'Supplier B';
export type SupplierKey = 'supplierA' | 'supplierB';
export type SimulateFailure = SupplierKey | 'both';

/** Raw hotel record as returned by a supplier. */
export interface SupplierHotel {
  name: string;
  price: number;
  commissionPct: number;
}

/** Deduplicated offer stored in Redis and returned by the API. */
export interface HotelOffer {
  name: string;
  price: number;
  supplier: SupplierName;
  commissionPct: number;
}

export interface WorkflowInput {
  city: string;
  simulateFailure?: SimulateFailure;
}

export interface WorkflowOutput {
  offers: HotelOffer[];
  failedSuppliers: SupplierKey[];
}
