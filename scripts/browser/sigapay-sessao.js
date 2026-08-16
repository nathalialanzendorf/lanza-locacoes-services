/**
 * SigaPay — captura sessão no Console (F12)
 *
 * 1. Abra https://sigapay.com.br/ logado
 * 2. Cole este script no Console → Enter
 * 3. Abra avisos/placas (qualquer pedido à API)
 * 4. Rode: copiarSessaoSigapay()
 * 5. Na app Lanza → Colagem manual → cookie + token
 */
(() => {
  const hostOk = (url) => {
    if (!url) return false;
    try {
      const h = new URL(url, location.href).hostname.toLowerCase();
      return h.includes("sigapay") || h.includes("zonaazul");
    } catch (e) {
      return /sigapay|zonaazul/i.test(url);
    }
  };

  const LS_KEY = "__lanzaSessaoSigapay";

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

  const carregar = () => {
    try {
      const s = localStorage.getItem(LS_KEY);
      if (s) return JSON.parse(s);
    } catch (e) {}
    return { cookie: null, token: null };
  };

  const out = carregar();
  window.__lanzaSessaoSigapay = out;

  const salvar = () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(out));
    } catch (e) {}
  };

  const tratar = (url, h) => {
    if (!hostOk(url)) return;
    const cookie = pick(h, "cookie");
    const auth = pick(h, "authorization");
    if (cookie?.trim()) {
      out.cookie = cookie.trim();
      salvar();
    }
    if (auth?.trim()) {
      out.token = auth.replace(/^Bearer\s+/i, "").trim();
      salvar();
    }
    if (out.cookie && out.token) {
      console.log("%cSigaPay", "color:#0a0", "cookie + token capturados");
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

  window.mostrarSessaoSigapay = () => console.table(out);

  window.copiarSessaoSigapay = async () => {
    if (!out.cookie?.trim() && !out.token?.trim()) {
      console.warn("Ainda vazio — navegue no portal (avisos/placas).");
      console.log(out);
      return;
    }
    const json = JSON.stringify(
      { cookie: out.cookie || "", token: out.token || "" },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(json);
    } catch (e) {
      console.log("Copie manualmente:\n", json);
      return;
    }
    console.log("%cCopiado! Cole na app → Colagem manual SigaPay", "color:#0a0;font-weight:bold");
    console.log(json);
  };

  window.limparSessaoSigapay = () => {
    localStorage.removeItem(LS_KEY);
    out.cookie = null;
    out.token = null;
    console.log("Sessão SigaPay limpa");
  };

  console.log(
    "%cCaptura SigaPay activa. Navegue no portal → copiarSessaoSigapay()",
    "color:#06c;font-weight:bold",
  );
  if (out.cookie || out.token) mostrarSessaoSigapay();
})();
