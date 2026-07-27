/** Timeout padrão de chamadas HTTP outbound e operações de rede (ms). */
export const HTTP_TIMEOUT_MS = 30_000;

export function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
}
