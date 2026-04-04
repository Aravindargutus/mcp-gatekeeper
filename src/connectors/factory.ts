import type { IMCPConnector } from "../core/interfaces.js";
import type { ServerTarget } from "../core/config.js";
import { StdioConnector } from "./stdio.connector.js";
import { SSEConnector } from "./sse.connector.js";
import { HttpConnector } from "./http.connector.js";
import { MockConnector } from "./mock.connector.js";
import { NullConnector } from "./null.connector.js";
import { ConfigError } from "../core/errors.js";

export function createConnector(target: ServerTarget): IMCPConnector {
  switch (target.transport) {
    case "stdio":
      if (!target.command) {
        throw new ConfigError(
          "stdio transport requires a 'command' in server config"
        );
      }
      return new StdioConnector({
        command: target.command,
        args: target.args,
        env: target.env,
        connectTimeout: target.connectTimeout,
        requestTimeout: target.requestTimeout,
      });

    case "sse":
      if (!target.url) {
        throw new ConfigError(
          "sse transport requires a 'url' in server config"
        );
      }
      return new SSEConnector({
        url: target.url,
        connectTimeout: target.connectTimeout,
        requestTimeout: target.requestTimeout,
      });

    case "http":
      if (!target.url) {
        throw new ConfigError(
          "http transport requires a 'url' in server config"
        );
      }
      return new HttpConnector({
        url: target.url,
        headers: target.headers,
        connectTimeout: target.connectTimeout,
        requestTimeout: target.requestTimeout,
        sessionId: target.sessionId,
      });

    case "mock":
      return new MockConnector();

    case "null":
      return new NullConnector();

    default:
      throw new ConfigError(
        `Unknown transport: ${target.transport}. Use 'stdio', 'sse', 'http', 'mock', or 'null'.`
      );
  }
}
