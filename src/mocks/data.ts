import type { SupplierHotel } from '../types';

type Catalog = Record<string, SupplierHotel[]>;

// Overlapping delhi names: Taj Palace (A cheaper), Hotel Sunshine (A cheaper), The Leela (B cheaper,
// note B's name differs in case/whitespace), Royal Orchid (B cheaper), Lotus Residency (exact price tie,
// B has higher commission -> Supplier B wins).
export const supplierAData: Catalog = {
  delhi: [
    { hotelId: 'a1', city: 'delhi', name: 'Taj Palace', price: 9500, commissionPct: 12 },
    { hotelId: 'a2', city: 'delhi', name: 'The Leela', price: 11000, commissionPct: 15 },
    { hotelId: 'a3', city: 'delhi', name: 'Hotel Sunshine', price: 3200, commissionPct: 10 },
    { hotelId: 'a4', city: 'delhi', name: 'Lotus Residency', price: 5500, commissionPct: 8 },
    { hotelId: 'a5', city: 'delhi', name: 'Royal Orchid', price: 6200, commissionPct: 11 },
    { hotelId: 'a6', city: 'delhi', name: 'Metro Stay', price: 2800, commissionPct: 9 },
  ],
  mumbai: [
    { hotelId: 'a11', city: 'mumbai', name: 'Sea View Inn', price: 7000, commissionPct: 10 },
    { hotelId: 'a12', city: 'mumbai', name: 'Gateway Grand', price: 12500, commissionPct: 14 },
    { hotelId: 'a13', city: 'mumbai', name: 'Marine Drive Hotel', price: 8800, commissionPct: 12 },
    { hotelId: 'a14', city: 'mumbai', name: 'Juhu Beach Resort', price: 9900, commissionPct: 13 },
  ],
};

export const supplierBData: Catalog = {
  delhi: [
    { hotelId: 'b1', city: 'delhi', name: 'Taj Palace', price: 9800, commissionPct: 14 },
    { hotelId: 'b2', city: 'delhi', name: 'the leela ', price: 10500, commissionPct: 13 },
    { hotelId: 'b3', city: 'delhi', name: 'Hotel Sunshine', price: 3500, commissionPct: 12 },
    { hotelId: 'b4', city: 'delhi', name: 'Lotus Residency', price: 5500, commissionPct: 10 },
    { hotelId: 'b5', city: 'delhi', name: 'Royal Orchid', price: 5800, commissionPct: 9 },
    { hotelId: 'b6', city: 'delhi', name: 'Capital Comfort', price: 4200, commissionPct: 11 },
    { hotelId: 'b7', city: 'delhi', name: 'Connaught Suites', price: 7400, commissionPct: 12 },
  ],
  mumbai: [
    { hotelId: 'b11', city: 'mumbai', name: 'Sea View Inn', price: 6800, commissionPct: 9 },
    { hotelId: 'b12', city: 'mumbai', name: 'Gateway Grand', price: 13000, commissionPct: 15 },
    { hotelId: 'b13', city: 'mumbai', name: 'Bandra Boutique', price: 5400, commissionPct: 10 },
  ],
};
