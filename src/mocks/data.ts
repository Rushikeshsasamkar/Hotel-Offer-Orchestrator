import type { SupplierHotel } from '../types';

type Catalog = Record<string, SupplierHotel[]>;

// Overlapping delhi names: Taj Palace (A cheaper), Hotel Sunshine (A cheaper), The Leela (B cheaper,
// note B's name differs in case/whitespace), Royal Orchid (B cheaper), Lotus Residency (exact price tie,
// B has higher commission -> Supplier B wins).
export const supplierAData: Catalog = {
  delhi: [
    { name: 'Taj Palace', price: 9500, commissionPct: 12 },
    { name: 'The Leela', price: 11000, commissionPct: 15 },
    { name: 'Hotel Sunshine', price: 3200, commissionPct: 10 },
    { name: 'Lotus Residency', price: 5500, commissionPct: 8 },
    { name: 'Royal Orchid', price: 6200, commissionPct: 11 },
    { name: 'Metro Stay', price: 2800, commissionPct: 9 },
  ],
  mumbai: [
    { name: 'Sea View Inn', price: 7000, commissionPct: 10 },
    { name: 'Gateway Grand', price: 12500, commissionPct: 14 },
    { name: 'Marine Drive Hotel', price: 8800, commissionPct: 12 },
    { name: 'Juhu Beach Resort', price: 9900, commissionPct: 13 },
  ],
};

export const supplierBData: Catalog = {
  delhi: [
    { name: 'Taj Palace', price: 9800, commissionPct: 14 },
    { name: 'the leela ', price: 10500, commissionPct: 13 },
    { name: 'Hotel Sunshine', price: 3500, commissionPct: 12 },
    { name: 'Lotus Residency', price: 5500, commissionPct: 10 },
    { name: 'Royal Orchid', price: 5800, commissionPct: 9 },
    { name: 'Capital Comfort', price: 4200, commissionPct: 11 },
    { name: 'Connaught Suites', price: 7400, commissionPct: 12 },
  ],
  mumbai: [
    { name: 'Sea View Inn', price: 6800, commissionPct: 9 },
    { name: 'Gateway Grand', price: 13000, commissionPct: 15 },
    { name: 'Bandra Boutique', price: 5400, commissionPct: 10 },
  ],
};
