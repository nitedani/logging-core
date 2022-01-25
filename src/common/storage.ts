import { AsyncLocalStorage } from "async_hooks";
import * as cuid from "cuid";
import winston from "winston";

interface RequestContext {
  error?: any;
  meta?: { [key: string]: any };
  requestId: string;
}

export const globalStore = new AsyncLocalStorage<RequestContext>();

// Allows easy access to a request's context
export const ctx = () => globalStore.getStore();

// Allows wrapping a request in a context
export const runWithCtx = (
  fx: (ctx?: RequestContext) => any,
  context: RequestContext
) => {
  globalStore.run(context, () => {
    return fx(ctx());
  });
};

export const withContext = (_req: Request, _res: Response, next: Function) => {
  runWithCtx(() => next(), { requestId: cuid() });
};

let _logger: winston.Logger | null = null;
let _metricsTransport: winston.transport | null = null;

export const getLogger = () => _logger;
export const setLogger = (logger) => {
  _logger = logger;
};

export const getMetricsTransport = () => _metricsTransport;
export const setMetricsTransport = (metricsTransport) => {
  _metricsTransport = metricsTransport;
};
