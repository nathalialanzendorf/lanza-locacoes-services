const DEFAULT_MAX_WAIT_MS = 90_000;
const POLL_MS = 500;

/** Aguarda DevTools responder — não valida portal (evita falso negativo durante arranque). */
export async function esperarDevtoolsPort(
  port: number,
  opts?: { maxWaitMs?: number; label?: string },
): Promise<string> {
  const maxWaitMs = opts?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const label = opts?.label ?? `porta ${port}`;

  for (let elapsed = 0; elapsed < maxWaitMs; elapsed += POLL_MS) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) {
        const j = (await r.json()) as { webSocketDebuggerUrl?: string };
        if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
      }
    } catch {
      /* ainda offline */
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  throw new Error(
    `Chrome DevTools não respondeu (${label}). Feche janelas Chrome de captura antigas ou rode npm run capture-bridges-restart.`,
  );
}

/** CDP activo na porta (ignora validação de portal). */
export async function devtoolsPortAtivo(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`);
    return r.ok;
  } catch {
    return false;
  }
}
