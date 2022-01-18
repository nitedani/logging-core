import * as winston from "winston";
import { Formatter, getInfo } from "./common/format";
import { ctx, getLogger } from "./common/storage";

//@ts-ignore
import LokiTransport = require("winston-loki");

const consoleTransport = new winston.transports.Console({
  format: winston.format.simple(),
});

export interface Options {
  console: boolean;
  loki?: {
    host: string;
    labels: { [key: string]: string };
    level?: string;
  };
}

export const createLogger = (options?: Options) => {
  const transports: winston.transport[] = [];
  if (options?.console) {
    transports.push(consoleTransport);
  }
  if (options?.loki) {
    const { host, labels, level } = options.loki;
    const lokiTransport = new LokiTransport({
      host,
      labels,
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
