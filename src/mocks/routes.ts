import { Router, type Request, type Response } from 'express';
import { config } from '../config';
import { supplierAData, supplierBData } from './data';
import type { SupplierHotel } from '../types';

function handler(data: Record<string, SupplierHotel[]>, forcedDown: () => boolean) {
  return (req: Request, res: Response): void => {
    if (req.query.fail === 'true' || forcedDown()) {
      res.status(503).json({ error: 'Supplier unavailable (simulated)' });
      return;
    }
    const city = typeof req.query.city === 'string' ? req.query.city.trim().toLowerCase() : '';
    const result = city ? (data[city] ?? []) : Object.values(data).flat();
    res.json(result);
  };
}

export function mockRoutes(): Router {
  const r = Router();
  r.get('/supplierA/hotels', handler(supplierAData, () => config.supplierADown));
  r.get('/supplierB/hotels', handler(supplierBData, () => config.supplierBDown));
  return r;
}
