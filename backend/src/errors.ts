import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';

export interface FieldError {
  field: string;
  message: string;
}

/** An error that is safe to show to the client: only its generic title/detail leave the server. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
    readonly errors?: FieldError[],
  ) {
    super(title);
  }
}

export const badRequest = (detail = 'The request is invalid.', errors?: FieldError[]) =>
  new HttpError(400, 'Invalid request', detail, errors);
export const unauthorized = () => new HttpError(401, 'Unauthorized', 'Authentication is required.');
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const conflict = (detail: string) => new HttpError(409, 'Conflict', detail);
export const unprocessable = (detail: string) => new HttpError(422, 'Unprocessable request', detail);

export const zodFieldErrors = (err: ZodError): FieldError[] =>
  err.issues.map((i) => ({ field: i.path.join('.') || '(body)', message: i.message }));

const send = (res: Parameters<ErrorRequestHandler>[2], status: number, title: string, detail?: string, errors?: FieldError[]) =>
  res
    .status(status)
    .type('application/problem+json')
    .json({ type: 'about:blank', title, status, ...(detail ? { detail } : {}), ...(errors ? { errors } : {}) });

export const notFoundHandler: RequestHandler = (_req, res) => {
  send(res, 404, 'Resource not found');
};

/** Converts any error into a generic RFC 9457 response. Details are logged server-side only. */
export const errorHandler =
  (logger: Logger): ErrorRequestHandler =>
  (err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof HttpError) return send(res, err.status, err.title, err.detail, err.errors);
    if (err instanceof ZodError) return send(res, 400, 'Invalid request', 'The request is invalid.', zodFieldErrors(err));
    const e = err as { type?: string; status?: number };
    if (e.type === 'entity.parse.failed' || e.type === 'entity.too.large' || e.type === 'encoding.unsupported') {
      return send(res, e.type === 'entity.too.large' ? 413 : 400, 'Invalid request', 'The request body could not be read.');
    }
    logger.error({ err, method: req.method, path: req.path }, 'Unhandled error');
    return send(res, 500, 'Internal server error', 'Something went wrong. Please try again later.');
  };
