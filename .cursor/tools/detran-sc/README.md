# Tool — DETRAN SC (Detran Digital)

API `transito-api` em [servicos.detran.sc.gov.br](https://servicos.detran.sc.gov.br/). Consulta **placa + RENAVAM** de `database/veiculos.json`.

Dois comandos CLI (mesma auth, destinos diferentes):

| CLI | Destino | Doc |
|-----|---------|-----|
| `sync-infracoes` | `database/cliente-despesas.json` (Infração) | [infracoes.md](infracoes.md) |
| `sync-ipva-licenciamento` | `database/parceiro-despesas.json` (IPVA, Licenciamento) | [ipva-licenciamento.md](ipva-licenciamento.md) |

Referência API: [reference.md](reference.md)

## Autenticação (variáveis de ambiente do utilizador)

| Variável | Uso |
|----------|-----|
| `DETRAN_SC_AUTH` | JWT Bearer (sem prefixo `Bearer` no valor) |
| `DETRAN_SC_EMPRESA` | Header `X-Empresa` |
| `DETRAN_SC_APP_VERSION` | Opcional — header `X-App-Version` (pode ir no `.env`) |

Defina `DETRAN_SC_AUTH` e `DETRAN_SC_EMPRESA` nas variáveis de ambiente do utilizador — **não** em `.env`.

**Login assistido (Windows):** `.\scripts\login-detran-sc.ps1` — abre **Chrome real via CDP** (não
Playwright), grava `DETRAN_SC_*` após login gov.br. O gov.br exige **hCaptcha** no login por
certificado; se o captcha falhar, o POST devolve **HTTP 302** de volta ao login (não é bug do script).

```powershell
# Recomendado (Chrome real — hCaptcha funciona):
.\scripts\login-detran-sc.ps1

# Se aparecer ECONNRESET/302 com Playwright:
.\scripts\login-detran-sc.ps1   # padrao ja e CDP; evite -Playwright
```

Token expira (~5 h). **Nunca** versionar no Git.

**Login gov.br (certificado):** o POST para `certificado.sso.acesso.gov.br/login?client_id=acesso.ciasc.sc.gov.br`
inclui `operation=login-certificate` e um **`h-captcha-response`** — mesmo no fluxo por certificado
A1. Não dá para replicar só com `curl` (OAuth incompleto + cookies de sessão/WAF). Use o navegador via
`.\scripts\login-detran-sc.ps1`. Se **400** ou **302** repetidos: `.\scripts\login-detran-sc.ps1 -Fresh`
(limpa o perfil Chrome dedicado). **Sempre** comece em `servicos.detran.sc.gov.br`, não abra
`sso.acesso.gov.br/login?client_id=...` directamente.

**Captcha** (Cloudflare Turnstile): o `requisitar-consulta` exige um token `c` no modo
`execute` com o `action` certo (`consulta_dossie_veiculo`) — o backend valida o action.

- **Automático (solver) — varredura 100% da frota**: `npx tsx scripts/detranSolver.ts`
  dirige um **Chrome real via CDP** (não detectado pelo Turnstile). Único passo manual: o
  **login gov.br** (a sessão persiste no perfil dedicado). O solver então **carrega o
  Turnstile sozinho**, mina um token `c` fresco por placa (sitekey+action conhecidos),
  consulta e ingere infrações + IPVA/licenciamento de toda a frota SC ativa. Ver
  [reference.md](reference.md) → "Solver".
- **Manual**: sem captcha, `requisitar-consulta` só devolve ticket se já houver consulta
  **pendente** para a placa (ex.: logo após consultar no portal) — senão `Captcha inválido`.

## Resumo rápido

```bash
# Varredura automática da frota (só com o login gov.br aberto)
npx tsx scripts/detranSolver.ts [--placa PLACA] [--dry-run]

# Infrações (locatário)
npx tsx src/run.ts sync-infracoes [--placa PLACA] [--dry-run]

# IPVA / licenciamento (parceiro)
npx tsx src/run.ts sync-ipva-licenciamento [--placa PLACA] [--dry-run]
```

Relatórios de lote: `relatorios/sync/_sync_infracoes.json`, `relatorios/sync/_sync_ipva_licenciamento.json`.

## Semântica `debitos[]` (mesma resposta API)

| Tipo no JSON | sync-infracoes | sync-ipva-licenciamento |
|--------------|----------------|-------------------------|
| Multa com auto | ✅ cliente-despesas | ❌ ignorar |
| IPVA | ❌ ignorar | ✅ parceiro-despesas |
| Licenciamento | ❌ ignorar | ✅ parceiro-despesas |

## Código

`src/lib/detranSc/` — `auth.ts`, `consulta.ts`, `mapInfracoes.ts`, `mapDebitosProprietario.ts`, `syncVeiculo.ts`, `syncDespesasVeiculo.ts`

Solver (Chrome real/CDP): `scripts/detranSolver.ts` + `scripts/detranBrowserHook.ts`

## Skills que usam esta tool

| Skill | CLI | Destino |
|-------|-----|---------|
| **sync-infracoes** | `sync-infracoes` | `database/cliente-despesas.json` |
| **sync-ipva-licenciamento** | `sync-ipva-licenciamento` | `database/parceiro-despesas.json` |

Outras skills relacionadas (consomem o JSON, não rodam sync):

- **cadastro-veiculo** — `renavam` obrigatório para consulta.
- **relatorio-encerramento-contrato** — infrações em `cliente-despesas.json`.
- **cadastro-despesa** — lançamento manual IPVA/licenciamento.
- **relatorio-prestacao-contas** — consome `parceiro-despesas.json`.
