export type User = { id: string; email: string; username: string; displayName: string; createdAt: string };
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000) }); }
  catch { throw new ApiError('We couldn’t reach the server. Check your connection and try again.', 0); }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const retry = response.headers.get('Retry-After');
    throw new ApiError(response.status === 429 ? `A few too many attempts. Try again in ${Math.max(1, Math.ceil(Number(retry ?? 60)/60))} minute(s).` : (typeof data?.error === 'string' ? data.error : data?.error?.message) ?? 'Something went wrong. Please try again.', response.status);
  }
  return data as T;
}
