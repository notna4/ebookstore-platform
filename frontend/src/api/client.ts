/** An error response from the API (RFC 9457 problem details) or a network failure (status 0). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(detail ?? title);
  }
}

export interface RequestOptions {
  body?: unknown;
  idempotencyKey?: string;
}

export interface ApiClient {
  request<T = void>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, options?: RequestOptions): Promise<T>;
}

export const createApiClient = (
  baseUrl: string,
  getToken: () => Promise<string | undefined>,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): ApiClient => ({
  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ApiError(0, 'Cannot reach the server', 'Cannot reach the server. Check your connection and try again.');
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const json: unknown = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const problem = (json ?? {}) as { title?: string; detail?: string };
      throw new ApiError(res.status, problem.title ?? 'Request failed', problem.detail);
    }
    return json as T;
  },
});

/** User-safe text for an unknown error. */
export const errorMessage = (err: unknown): string =>
  err instanceof ApiError ? err.detail ?? err.title : 'Something went wrong. Please try again.';
