const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : d;
};

const port = num(process.env.PORT, 3000);

export const config = {
  port,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  temporalAddress: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  taskQueue: process.env.TASK_QUEUE ?? 'hotel-offers',
  supplierBaseUrl: process.env.SUPPLIER_BASE_URL ?? `http://localhost:${port}`,
  cacheTtlSeconds: num(process.env.CACHE_TTL_SECONDS, 300),
  supplierADown: process.env.SUPPLIER_A_DOWN === 'true',
  supplierBDown: process.env.SUPPLIER_B_DOWN === 'true',
  workflowTimeoutMs: num(process.env.WORKFLOW_TIMEOUT_MS, 20000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
