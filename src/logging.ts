import * as winston from "winston";
import { Formatter, getInfo } from "./common/format";
import { ctx, getLogger } from "./common/storage";

//@ts-ignore
import LokiTransport = require("winston-loki");
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { JaegerExporter } from "@opentelemetry/exporter-jaeger";
import {
  CompositePropagator,
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

export const createTracer = ({
  service_name,
  tempo,
}: Pick<Options, "tempo" | "service_name">) => {
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
    spanProcessor: new BatchSpanProcessor(
      new JaegerExporter({
        endpoint: `${tempo!.host}/api/traces`,
      })
    ),
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

export const createLogger = (options?: Options) => {
  const transports: winston.transport[] = [];
  if (options?.console) {
    transports.push(consoleTransport);
  }
  if (options?.loki) {
    const { host, labels, level } = options.loki;
    const lokiTransport = new LokiTransport({
      host,
      labels: { ...labels, service: options.service_name },
      format: winston.format.json(),
      level: level || "debug",
    });
    transports.push(lokiTransport);
  }

  const logger = winston.createLogger({
    format: new Formatter(),
    transports,
  });

  return logger;
};

export const logRequestResponse = (req, res) => {
  const logger = getLogger()!;
  const error = ctx()!.error;
  const toLog = getInfo(req, res, error);

  if (res.statusCode < 400 && res.statusCode >= 200) {
    logger.info(toLog);
  } else {
    if (res.statusCode >= 500) {
      logger.error(toLog);
    } else {
      logger.warn(toLog);
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
