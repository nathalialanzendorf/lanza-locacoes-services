/**
 * DETRAN RS — captura sessão no Console (F12)
 *
 * 1. Abra https://pcsdetran.rs.gov.br/ logado
 * 2. Cole este script no Console → Enter
 * 3. Carregue/consulte a frota ou um veículo
 * 4. Rode: copiarSessaoDetranRs()
 * 5. Na app Lanza → Colagem manual → auth + userId
 */
(() => {
  const HOST = "pcsdetran.procergs.com.br";
  const LS_KEY = "__lanzaSessaoDetranRs";

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
    return { auth: null, userId: null };
  };

  const out = carregar();
  window.__lanzaSessaoDetranRs = out;

  const salvar = () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(out));
    } catch (e) {}
  };

  const tratar = (url, h) => {
    if (!url || !url.includes(HOST)) return;
    const a = pick(h, "authorization");
    const uid = pick(h, "x-user-id");
    if (a && /bearer/i.test(a)) {
      out.auth = a.replace(/^Bearer\s+/i, "").trim();
      salvar();
    }
    if (uid?.trim()) {
      out.userId = uid.trim();
      salvar();
    }
    if (out.auth && out.userId) {
      console.log("%cDETRAN RS", "color:#0a0", "sessão completa");
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

  window.mostrarSessaoDetranRs = () => console.table(out);

  window.copiarSessaoDetranRs = async () => {
    if (!out.auth || !out.userId) {
      console.warn("Ainda incompleto — carregue a frota ou consulte um veículo RS.");
      console.log(out);
      return;
    }
    const json = JSON.stringify({ auth: out.auth, userId: out.userId }, null, 2);
    try {
      await navigator.clipboard.writeText(json);
    } catch (e) {
      console.log("Copie manualmente:\n", json);
      return;
    }
    console.log("%cCopiado! Cole na app → Colagem manual DETRAN RS", "color:#0a0;font-weight:bold");
    console.log(json);
  };

  window.limparSessaoDetranRs = () => {
    localStorage.removeItem(LS_KEY);
    out.auth = null;
    out.userId = null;
    console.log("Sessão DETRAN RS limpa");
  };

  console.log(
    "%cCaptura DETRAN RS activa. Consulte frota → copiarSessaoDetranRs()",
    "color:#06c;font-weight:bold",
  );
  if (out.auth) mostrarSessaoDetranRs();
})();
