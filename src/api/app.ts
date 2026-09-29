import express, { type ErrorRequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '../logger';
import { mockRoutes } from '../mocks/routes';
import { defaultDeps, type Deps } from './deps';
import { healthRouter } from './routes/health';
import { hotelsRouter } from './routes/hotels';

export function createApp(deps: Deps = defaultDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));
  app.use(mockRoutes());
  app.use(hotelsRouter(deps));
  app.use(healthRouter(deps));
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    req.log.error({ err: err instanceof Error ? err.message : String(err) }, 'request failed');
    if (res.headersSent) return;
    res.status(503).json({ error: 'Service temporarily unavailable' });
  };
  app.use(onError);
  return app;
}
