import httpProxy from 'http-proxy';
import { IncomingMessage, ServerResponse } from 'node:http';

export interface ProxyHandler {
  forward(req: IncomingMessage, res: ServerResponse): void;
}

export function createProxyHandler(targetBaseUrl: string, apiSecret?: string): ProxyHandler {
  const proxy = httpProxy.createProxyServer({
    target: targetBaseUrl,
    changeOrigin: true,
    selfHandleResponse: false,
  });

  // Inject auth token on every outbound request to mac-api
  if (apiSecret) {
    proxy.on('proxyReq', (proxyReq) => {
      proxyReq.setHeader('x-zlar-token', apiSecret);
    });
  }

  proxy.on('error', (err, _req, res) => {
    console.error('[ZLAR] Proxy error:', err.message);
    if (res && 'writeHead' in res) {
      const response = res as ServerResponse;
      if (!response.headersSent) {
        response.writeHead(502, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({
          error: 'Bad Gateway',
          message: 'ZLAR Gateway could not reach the target service',
        }));
      }
    }
  });

  return {
    forward(req: IncomingMessage, res: ServerResponse) {
      // express.json() consumes the request body stream.
      // http-proxy needs the body re-injected as a buffer.
      const rawBody = (req as any).rawBody as Buffer | undefined;
      if (rawBody && rawBody.length > 0) {
        proxy.web(req, res, { buffer: createReadableFromBuffer(rawBody) });
      } else {
        proxy.web(req, res);
      }
    },
  };
}

function createReadableFromBuffer(buf: Buffer) {
  const { Readable } = require('node:stream');
  const readable = new Readable();
  readable.push(buf);
  readable.push(null);
  return readable;
}
