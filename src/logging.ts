import * as winston from "winston";
import { Formatter, getInfo } from "./common/format";
import { ctx, getLogger, setMetricsTransport } from "./common/storage";
import {} from "triple-beam";
//@ts-ignore
import LokiTransport = require("winston-loki");
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  ReadableSpan,
  SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { JaegerExporter } from "@opentelemetry/exporter-jaeger";
import {
  CompositePropagator,
  ExportResult,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { JaegerPropagator } from "@opentelemetry/propagator-jaeger";
import { B3InjectEncoding, B3Propagator } from "@opentelemetry/propagator-b3";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import Graceful from "node-graceful";
import { registerInstrumentations } from "@opentelemetry/instrumentation";

const consoleTransport = new winston.transports.Console({
  format: winston.format.simple(),
});

export interface Options {
  console: boolean;
  service_name: string;
  loki?: {
    host: string;
    labels?: { [key: string]: string };
    level?: string;
  };
  tempo?: {
    host: string;
  };
}

registerInstrumentations({
  instrumentations: [getNodeAutoInstrumentations()],
});

class MultiExporter implements SpanExporter {
  exporters: SpanExporter[];
  constructor(exporters: SpanExporter[]) {
    this.exporters = exporters;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    for (const exporter of this.exporters) {
      exporter.export(spans, (args) => {});
    }
    resultCallback({ code: 0 });
  }
  shutdown(): Promise<void> {
    return Promise.all(this.exporters.map((e) => e.shutdown())).then(() => {});
  }
}

class HttpLokiExporter implements SpanExporter {
  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    const httpSpans = spans
      .filter(
        (span) =>
          span.instrumentationLibrary.name ===
          "@opentelemetry/instrumentation-http"
      )
      // Filter out spans that belong to an incoming request
      .filter((span) => !("net.host.ip" in span.attributes));
    if (httpSpans.length) {
      const logger = getLogger();
      for (const span of httpSpans) {
        logger?.debug(`Outgoing request - ${span.name}`, {
          traceId: span.spanContext().traceId,
          ...span.attributes,
        });
      }
    }

    resultCallback({ code: 0 });
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

export const createTracer = ({
  service_name,
  tempo,
}: Pick<Options, "tempo" | "service_name">) => {
  const exporters = [new HttpLokiExporter()];
  if (tempo?.host) {
    exporters.push(
      new JaegerExporter({
        endpoint: `${tempo.host}/api/traces`,
      })
    );
  }
  const sdk = new NodeSDK({
    /*
    metricExporter: new PrometheusExporter({
      port: 8081,
    }),
    metricInterval: 6000,
    */
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: service_name,
    }),
    spanProcessor: new BatchSpanProcessor(new MultiExporter(exporters)),
    contextManager: new AsyncLocalStorageContextManager(),
    textMapPropagator: new CompositePropagator({
      propagators: [
        new JaegerPropagator(),
        new W3CTraceContextPropagator(),
        new W3CBaggagePropagator(),
        new B3Propagator(),
        new B3Propagator({
          injectEncoding: B3InjectEncoding.MULTI_HEADER,
        }),
      ],
    }),
  });

  Graceful.on("exit", async () => {
    const logger = getLogger();
    try {
      await sdk.shutdown();
      logger?.info("Tracing terminated");
    } catch (error) {
      logger?.error("Error terminating tracing", error);
    }
  });

  return sdk;
};

export const createLogger = (options: Options) => {
  const transports: winston.transport[] = [];
  if (options.console) {
    transports.push(consoleTransport);
  }
  if (options.loki) {
    const { host, labels, level } = options.loki;
    const lokiTransport = new LokiTransport({
      host,
      labels: { ...labels, service: options.service_name },
      format: winston.format.json(),
      level: level || "debug",
    });
    setMetricsTransport(lokiTransport);
    transports.push(lokiTransport);
  }

  return winston.createLogger({
    format: new Formatter(),
    transports,
  });
};

export const logRequestResponse = (req, res) => {
  const logger = getLogger()!;
  const error = ctx()?.error;
  const toLog = getInfo(req, res, error);
  const withLabel = { ...toLog, labels: { context: "request" } };

  if (res.statusCode < 400 && res.statusCode >= 200) {
    logger.info(withLabel);
  } else {
    if (res.statusCode >= 500) {
      logger.error(withLabel);
    } else {
      logger.warn(withLabel);
    }
  }
};

export const loggerMiddleware = (req, res, next) => {
  req.start = Date.now();
  req.socket._prevBytesWritten = req.socket.bytesWritten;
  next();

  res.once("finish", () => {
    logRequestResponse(req, res);
  });
};
