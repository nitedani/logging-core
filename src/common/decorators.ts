import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { aroundMethodDecarator } from "../utils/decorator";
import { finalize, isObservable, catchError } from "rxjs";

export const Span = (spanName?: string) =>
  aroundMethodDecarator((args, methodName, next) => {
    const currentSpan = trace.getSpan(context.active());
    if (!currentSpan) {
      return next(...args);
    }

    const tracer = trace.getTracer("default");

    return context.with(trace.setSpan(context.active(), currentSpan), () => {
      const span = tracer.startSpan(spanName || methodName);

      try {
        const result = next(...args);

        if (
          !!result &&
          (typeof result === "object" || typeof result === "function") &&
          typeof result.then === "function"
        ) {
          return result
            .catch((err) => {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: typeof err === "object" ? err.message : err,
              });
              span.recordException(err);
            })
            .finally(() => {
              span.end();
            });
        } else if (isObservable(result)) {
          return result.pipe(
            catchError((err) => {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: typeof err === "object" ? err.message : err,
              });
              span.recordException(err);
              throw err;
            }),
            finalize(() => {
              span.end();
            })
          );
        } else {
          span.end();
          return result;
        }
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: typeof err === "object" ? err.message : err,
        });
        span.recordException(err);
        span.end();
        throw err;
      }
    });
  });
