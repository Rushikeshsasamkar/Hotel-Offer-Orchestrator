import { Router } from 'express';
import { config } from '../../config';
import type { Deps } from '../deps';
import type { SupplierKey } from '../../types';

interface Check {
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
}

async function timed(fn: () => Promise<void>): Promise<Check> {
  const start = Date.now();
  try {
    await fn();
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'down', latencyMs: Date.now() - start, error: (err as Error).message };
  }
}

async function pingSupplier(path: SupplierKey): Promise<void> {
  const res = await fetch(`${config.supplierBaseUrl}/${path}/hotels?city=health`, {
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
}

export function healthRouter(deps: Deps): Router {
  const r = Router();
  r.get('/health', async (_req, res) => {
    const [supplierA, supplierB, redis, temporal] = await Promise.all([
      timed(() => pingSupplier('supplierA')),
      timed(() => pingSupplier('supplierB')),
      timed(() => deps.pingRedis()),
      timed(() => deps.checkTemporal()),
    ]);
    const ok = [supplierA, supplierB, redis, temporal].every((c) => c.status === 'up');
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      suppliers: { supplierA, supplierB },
      redis,
      temporal,
    });
  });
  return r;
}
