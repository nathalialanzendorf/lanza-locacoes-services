/**
 * DETRAN SC — captura sessão no Console (F12)
 *
 * 1. Abra https://servicos.detran.sc.gov.br/ logado
 * 2. Cole este script no Console → Enter
 * 3. Consulte um veículo (dispara pedidos à API)
 * 4. Rode: logarCamposDetranSc()  (ver campos)  ou  copiarSessaoDetranSc()  (copiar JSON)
 * 5. Na app Lanza → Colagem manual → cole auth + empresa
 */
(() => {
  const HOST = "backend.detran.sc.gov.br";
  const LS_KEY = "__lanzaSessaoDetranSc";

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
    return { auth: null, empresa: null };
  };

  const out = carregar();
  window.__lanzaSessaoDetranSc = out;

  const salvar = () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(out));
    } catch (e) {}
  };

  const tratar = (url, h) => {
    if (!url || !url.includes(HOST)) return;
    const a = pick(h, "authorization");
    if (a && /bearer/i.test(a)) {
      out.auth = a.replace(/^Bearer\s+/i, "").trim();
      out.empresa = pick(h, "x-empresa") || out.empresa;
      salvar();
      console.log("%cDETRAN SC", "color:#0a0", "token capturado", out.empresa ? `empresa ${out.empresa}` : "");
      if (out.auth && out.empresa && typeof window.logarCamposDetranSc === "function") {
        window.logarCamposDetranSc();
      }
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

  window.mostrarSessaoDetranSc = () => console.table(out);

  /** Mostra no Console os campos para colar na app (Colagem manual). */
  window.logarCamposDetranSc = () => {
    const auth = out.auth ? String(out.auth).replace(/^Bearer\s+/i, "").trim() : "";
    const empresa = out.empresa ? String(out.empresa).trim() : "";

    console.log("%c── Colagem manual DETRAN SC ──", "color:#06c;font-weight:bold;font-size:13px");
    console.log("Na app Lanza: Relatórios → Sessão DETRAN SC → Colagem manual\n");

    if (!auth || !empresa) {
      console.warn("Sessão incompleta — consulte um veículo no portal com este script activo.");
    }

    console.log("%c1) Token JWT (Authorization)", "font-weight:bold;color:#333");
    if (auth) {
      console.log(auth);
    } else {
      console.log("%c(vazio — falta consultar veículo)", "color:#c60");
    }

    console.log("%c2) X-Empresa", "font-weight:bold;color:#333");
    if (empresa) {
      console.log(empresa);
    } else {
      console.log("%c(vazio — falta consultar veículo)", "color:#c60");
    }

    console.log("%c── JSON (alternativa: copiar tudo de uma vez) ──", "color:#666;font-weight:bold");
    console.log(JSON.stringify({ auth, empresa }, null, 2));

    console.log("%cComandos:", "font-weight:bold");
    console.log("  logarCamposDetranSc()  — mostrar campos (este)");
    console.log("  copiarSessaoDetranSc() — copiar JSON para a área de transferência");

    return { auth, empresa };
  };

  window.copiarSessaoDetranSc = async () => {
    if (!out.auth || !out.empresa) {
      console.warn("Ainda incompleto — consulte um veículo no portal com o script activo.");
      console.log(out);
      return;
    }
    const json = JSON.stringify({ auth: out.auth, empresa: out.empresa }, null, 2);
    try {
      await navigator.clipboard.writeText(json);
    } catch (e) {
      console.log("Copie manualmente:\n", json);
      return;
    }
    console.log("%cCopiado! Cole na app → Colagem manual DETRAN SC", "color:#0a0;font-weight:bold");
    console.log(json);
  };

  window.limparSessaoDetranSc = () => {
    localStorage.removeItem(LS_KEY);
    out.auth = null;
    out.empresa = null;
    console.log("Sessão DETRAN SC limpa");
  };

  // aliases (Console aceita só o nome exacto — camelCase)
  window.copiarSessaoDetranSC = window.copiarSessaoDetranSc;
  window.copiar_sessao_detran_sc = window.copiarSessaoDetranSc;
  window.copiarsessaodetransc = window.copiarSessaoDetranSc;
  window.logarCampos = window.logarCamposDetranSc;
  window.logarSessaoDetranSc = window.logarCamposDetranSc;
  window.mostrarCamposDetranSc = window.logarCamposDetranSc;

  console.log(
    "%cCaptura DETRAN SC activa. Consulte um veículo → logarCamposDetranSc() ou copiarSessaoDetranSc()",
    "color:#06c;font-weight:bold",
  );
  console.log("Comandos: logarCamposDetranSc()  |  copiarSessaoDetranSc()");
  if (out.auth) logarCamposDetranSc();
})();
