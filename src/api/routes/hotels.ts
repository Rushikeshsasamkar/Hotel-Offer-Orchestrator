import { Router } from 'express';
import { z } from 'zod';
import { AllSuppliersDownError, type Deps } from '../deps';

const optionalNumber = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    const n = v === '' ? NaN : Number(v);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: 'custom', message: 'must be a finite number >= 0' });
      return z.NEVER;
    }
    return n;
  });

const querySchema = z
  .object({
    city: z.string({ error: 'city is required' }).trim().min(1, 'city is required').transform((s) => s.toLowerCase()),
    minPrice: optionalNumber,
    maxPrice: optionalNumber,
    simulateFailure: z.enum(['supplierA', 'supplierB', 'both']).optional(),
  })
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    message: 'minPrice must be <= maxPrice',
    path: ['minPrice'],
  });

export function hotelsRouter(deps: Deps): Router {
  const r = Router();
  r.get('/api/hotels', async (req, res, next) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      const error = parsed.error.issues.map((i) => `${i.path.join('.') || 'query'}: ${i.message}`).join('; ');
      res.status(400).json({ error });
      return;
    }
    const { city, minPrice, maxPrice, simulateFailure } = parsed.data;
    try {
      const { failedSuppliers } = await deps.runWorkflow({ city, simulateFailure });
      // Redis is the single read path: price filtering happens in ZRANGEBYSCORE.
      const offers = await deps.queryOffers(city, minPrice, maxPrice);
      if (failedSuppliers.length > 0) res.setHeader('X-Partial-Results', failedSuppliers.join(','));
      res.json(offers);
    } catch (err) {
      if (err instanceof AllSuppliersDownError) {
        res.status(502).json({ error: 'All suppliers unavailable' });
        return;
      }
      next(err);
    }
  });
  return r;
}
