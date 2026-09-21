import type { IncomingMessage, ServerResponse } from 'node:http';
import type { JwtPayload } from '../auth/jwt.ts';

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestContext {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  headers: IncomingMessage['headers'];
  /** Populated by the auth middleware when a valid bearer token is present. */
  user: JwtPayload | null;
}

/** Thrown by handlers/middleware to short-circuit with a status + message. */
export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export interface JsonResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export type Handler = (ctx: RequestContext) => Promise<JsonResponse> | JsonResponse;
export type Middleware = (ctx: RequestContext) => Promise<void> | void;

interface Route {
  method: Method;
  segments: string[];
  handler: Handler;
}

export function json(status: number, body: unknown, headers?: Record<string, string>): JsonResponse {
  return { status, body, headers };
}

/** Small path router with `:param` segments and pluggable middleware. */
export class Router {
  private routes: Route[] = [];
  private middlewares: Middleware[] = [];

  use(mw: Middleware): this {
    this.middlewares.push(mw);
    return this;
  }

  add(method: Method, path: string, handler: Handler): this {
    this.routes.push({ method, segments: splitPath(path), handler });
    return this;
  }

  get(path: string, h: Handler): this { return this.add('GET', path, h); }
  post(path: string, h: Handler): this { return this.add('POST', path, h); }
  patch(path: string, h: Handler): this { return this.add('PATCH', path, h); }
  put(path: string, h: Handler): this { return this.add('PUT', path, h); }
  delete(path: string, h: Handler): this { return this.add('DELETE', path, h); }

  private match(method: string, segments: string[]): { route: Route; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== segments.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i]!;
        const actual = segments[i]!;
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = decodeURIComponent(actual);
        } else if (seg !== actual) {
          ok = false;
          break;
        }
      }
      if (ok) return { route, params };
    }
    return null;
  }

  async handle(ctx: RequestContext): Promise<JsonResponse> {
    const segments = splitPath(ctx.path);
    const matched = this.match(ctx.method, segments);
    if (!matched) {
      // Distinguish 404 (no path) from 405 (path exists, wrong method).
      const pathExists = this.routes.some(
        (r) => r.segments.length === segments.length && matchSegments(r.segments, segments),
      );
      throw new HttpError(pathExists ? 405 : 404, pathExists ? 'Method not allowed' : 'Not found');
    }
    ctx.params = matched.params;
    for (const mw of this.middlewares) {
      await mw(ctx);
    }
    return matched.route.handler(ctx);
  }
}

function matchSegments(routeSegs: string[], actual: string[]): boolean {
  for (let i = 0; i < routeSegs.length; i++) {
    const seg = routeSegs[i]!;
    if (!seg.startsWith(':') && seg !== actual[i]) return false;
  }
  return true;
}

function splitPath(path: string): string[] {
  return path.split('?')[0]!.split('/').filter((s) => s.length > 0);
}

export function applyCors(
  res: ServerResponse,
  origin: string | undefined,
  allowed: string[],
): void {
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export async function readJsonBody(req: IncomingMessage, maxBytes = 5_000_000): Promise<unknown> {
  if ((req as any).body !== undefined && (req as any).body !== null) {
    const raw = (req as any).body;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    return raw;
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new HttpError(413, 'Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve(undefined);
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.trim().length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}
