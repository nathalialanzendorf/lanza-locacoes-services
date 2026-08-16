/**
 * Pedágio Digital — captura sessão no Console (F12)
 *
 * 1. Abra https://pedagiodigital.com/ logado
 * 2. Cole este script no Console → Enter
 * 3. Carregue a lista de placas (F5 se necessário)
 * 4. Rode: copiarSessaoPedagio()
 * 5. Na app Lanza → Colagem manual → cookie + csrf
 */
(() => {
  const HOST = "pedagiodigital.com";
  const LS_KEY = "__lanzaSessaoPedagio";

  const pick = (h, n) => {
    if (!h) return undefined;
    n = n.toLowerCase();
    if (typeof Headers !== "undefined" && h instanceof Headers) {
      for (const [k, v] of h) if (k.toLowerCase() === n) return v;
      return undefined;
    }
    if (Array.isArray(h)) {
      for (const [k, v] of h) if (String(k).toLowerCase() === n) return v;
      return undefined;
    }
    for (const k in h) if (k.toLowerCase() === n) return h[k];
    return undefined;
  };

  const csrfFromCookie = (cookie) => {
    for (const part of cookie.split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (name === "bff-csrf" || name === "XSRF-TOKEN") return value;
    }
    return "";
  };

  const carregar = () => {
    try {
      const s = localStorage.getItem(LS_KEY);
      if (s) return JSON.parse(s);
    } catch (e) {}
    return { cookie: null, csrf: null };
  };

  const out = carregar();
  window.__lanzaSessaoPedagio = out;

  const salvar = () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(out));
    } catch (e) {}
  };

  const tratar = (url, h) => {
    if (!url || !url.includes(HOST)) return;
    const cookie = pick(h, "cookie");
    const csrfHeader = pick(h, "x-csrf-token") || pick(h, "x-xsrf-token");
    if (cookie?.includes("bff_sid")) {
      out.cookie = cookie;
      if (!out.csrf) {
        const fromCookie = csrfFromCookie(cookie);
        if (fromCookie) out.csrf = fromCookie;
      }
      salvar();
    }
    if (csrfHeader?.trim()) {
      out.csrf = csrfHeader.trim();
      salvar();
    } else if (cookie) {
      const fromCookie = csrfFromCookie(cookie);
      if (fromCookie) {
        out.csrf = fromCookie;
        salvar();
      }
    }
    if (out.cookie?.includes("bff_sid") && out.csrf) {
      console.log("%cPedágio", "color:#0a0", "cookie + CSRF capturados");
    } else if (out.cookie?.includes("bff_sid") && !out.csrf) {
      console.log("%cPedágio", "color:#c80", "login OK — carregue a lista de placas (F5)");
    }
  };

  const fo = window.fetch;
  window.fetch = function (i, init) {
    try {
      const u = typeof i === "string" ? i : i && i.url;
      tratar(u, (init && init.headers) || (i && i.headers));
    } catch (e) {}
    return fo.apply(this, arguments);
  };

  const xo = XMLHttpRequest.prototype.open;
  const xs = XMLHttpRequest.prototype.setRequestHeader;
  const xse = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__lanzaUrl = u;
    this.__lanzaH = {};
    return xo.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try {
      this.__lanzaH[k] = v;
    } catch (e) {}
    return xs.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    try {
      tratar(this.__lanzaUrl, this.__lanzaH);
    } catch (e) {}
    return xse.apply(this, arguments);
  };

  window.mostrarSessaoPedagio = () => console.table(out);

  window.copiarSessaoPedagio = async () => {
    if (!out.cookie?.includes("bff_sid") || !out.csrf?.trim()) {
      console.warn("Incompleto — faça login e carregue a lista de placas (F5).");
      console.log(out);
      return;
    }
    const json = JSON.stringify({ cookie: out.cookie, csrf: out.csrf }, null, 2);
    try {
      await navigator.clipboard.writeText(json);
    } catch (e) {
      console.log("Copie manualmente:\n", json);
      return;
    }
    console.log("%cCopiado! Cole na app → Colagem manual Pedágio", "color:#0a0;font-weight:bold");
    console.log(json);
  };

  window.limparSessaoPedagio = () => {
    localStorage.removeItem(LS_KEY);
    out.cookie = null;
    out.csrf = null;
    console.log("Sessão Pedágio limpa");
  };

  console.log(
    "%cCaptura Pedágio activa. Login + lista placas → copiarSessaoPedagio()",
    "color:#06c;font-weight:bold",
  );
  if (out.cookie) mostrarSessaoPedagio();
})();
