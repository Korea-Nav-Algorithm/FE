export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null) {
    super(code || `HTTP ${status}`);
    this.status = status;
    this.code = code;
  }
}

export function routeErrorMessage(failure: unknown): string {
  if (!(failure instanceof ApiError)) return '경로를 불러오지 못했습니다.';
  if (failure.status === 400 || failure.code === 'INVALID_REQUEST') return '경로 요청 정보를 확인해주세요.';
  if (failure.status === 404 || failure.status === 422 || failure.code === 'ROUTE_NOT_FOUND') return '이 구간의 경로를 찾지 못했습니다.';
  if (failure.status === 503 || failure.code === 'ENGINE_UNAVAILABLE') return '경로 엔진을 사용할 수 없습니다.';
  return '경로를 불러오지 못했습니다.';
}

/** All Backend requests use same-origin /api and a fixed timeout. */
async function requestJson<Response>(path: string, method: 'GET' | 'POST', body?: object, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`/api${path}`, { method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extraHeaders },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { code?: string; error?: string | { code?: string } } | null;
      const code = typeof payload?.error === 'string' ? payload.error : payload?.error?.code || payload?.code || null;
      throw new ApiError(response.status, code);
    }
    if (response.status === 204) return undefined as Response;
    const bodyText = await response.text();
    return (bodyText ? JSON.parse(bodyText) : undefined) as Response;
  } finally { globalThis.clearTimeout(timeout); }
}

export function postJson<Response>(path: string, body: object, headers?: Record<string, string>): Promise<Response> { return requestJson(path, 'POST', body, headers); }
export function getJson<Response>(path: string, headers?: Record<string, string>): Promise<Response> { return requestJson(path, 'GET', undefined, headers); }
