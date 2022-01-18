import { ctx } from "./storage";

export class Formatter {
  transform(info, _opts) {
    const context = ctx();

    if (info.level === "error" || info instanceof Error) {
      info = Object.assign({}, getError(info));
    }

    if (context && context.requestId) {
      info.requestId = context.requestId;
    }

    if (typeof info.message === "object") {
      Object.assign(info, info.message);
      delete info.message;
    }

    return info;
  }
}

export const getError = (error: any) => {
  if (typeof error === "object") {
    const { message, stack, ...rest } = error;
    return {
      message,
      stack,
      ...rest,
    };
  }

  return { message: error };
};

export const getInfo = (req, res, error?) => {
  const { method, originalUrl, body } = req;
  const { statusCode } = res;
  const bytesWritten = req.socket.bytesWritten - req.socket._prevBytesWritten;

  const isGql = !!(
    typeof body === "object" &&
    body.operationName &&
    body.variables &&
    body.query
  );
  const uri = isGql ? `${originalUrl} - ${body.operationName}` : originalUrl;
  const message: string = `HTTP request served - ${statusCode} - ${method} - ${uri}`;
  const toLog = {
    message,
    remote_addr: req.ip,
    timestamp: new Date(),
    protocol: req.protocol,
    request: {
      time: Date.now() - req.start,
      method,
      hostname: req.hostname,
      uri,
      size: req.socket.bytesRead,
      user_agent: req.headers["user-agent"],
      referer: req.headers["referer"],
    },
    response: {
      status: statusCode,
      size: res.getHeader("Content-Length") || bytesWritten,
    },
  };

  if (error) {
    const { name, stack, message /* ...rest  */ } = getError(error);
    Object.assign(toLog, {
      stack: [stack].flat(),
      error_message: message,
      error_name: name,
      //error_meta: rest,
    });
  }

  return toLog;
};
