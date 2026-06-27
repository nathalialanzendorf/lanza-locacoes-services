# Tool — Pedágio Digital (pedagiodigital.com)

Integração com o BFF de [pedagiodigital.com](https://pedagiodigital.com) (`/bff/api`) para:

- **cadastrar placa** (`register`) — usado após **cadastro-veiculo** em veículo novo;
- **excluir placa** (`delete`) — ao **inativar** um veículo (`ativo: false`);
- **listar veículos** da conta;
- **listar passagens** (pedágios) **em aberto** e **pagas** por placa.

Skill de negócio que usa esta tool: **`sync-pedagios`** (passagens em aberto → `database/cliente-despesas.json`, categoria `Pedágio`; push ao Rastreame por `sync-gastos-gerais`).

Referência técnica (endpoints, payloads, captura de sessão): [reference.md](reference.md).

## Autenticação (variáveis de ambiente do utilizador)

Credenciais por **CPF + senha**; a tool faz login e mantém a sessão (cookie `bff_sid` + CSRF) em cache. O site **não usa JWT Bearer**: a sessão é por **cookie** + **CSRF double-submit**.

| Variável | Uso |
|----------|-----|
| `PEDAGIO_DIGITAL_LOGIN` | **CPF** de acesso (login); enviado só com dígitos |
| `PEDAGIO_DIGITAL_SENHA` | Senha |
| `PEDAGIO_DIGITAL_CAPTCHA` | Token **reCAPTCHA** para `POST /bff/login` (válido ~2 min) |
| `PEDAGIO_DIGITAL_CONCESSAO` | Opcional — `tokenConcessao` (default `44`) |
| `PEDAGIO_DIGITAL_COOKIE` | *Override (recomendado)* — header `Cookie` completo capturado no DevTools |
| `PEDAGIO_DIGITAL_CSRF` | *Override (recomendado)* — header `x-csrf-token` (= cookie `bff-csrf`) |
| `PEDAGIO_DIGITAL_USER_AGENT` | Opcional — sobrescreve o User-Agent (pode ir no `.env`) |
| `PEDAGIO_DIGITAL_TLS_INSECURE` | Opcional — `1` desativa verificação TLS (redes com antivírus/proxy MITM) |

> ⚠️ **reCAPTCHA:** `POST /bff/login` exige `tokenCaptcha` gerado no browser (vida ~2 min). Não dá para automatizar o login de forma desatendida. **Para uso recorrente**, capture a sessão já logada no DevTools em `PEDAGIO_DIGITAL_COOKIE` + `PEDAGIO_DIGITAL_CSRF` (têm prioridade sobre o login). O login por credenciais só roda se `PEDAGIO_DIGITAL_CAPTCHA` (fresco) estiver definido.

Defina as credenciais nas variáveis de ambiente do utilizador — **não** em `.env`. **Nunca** versionar no Git.

```powershell
[Environment]::SetEnvironmentVariable("PEDAGIO_DIGITAL_LOGIN", "<cpf>", "User")
[Environment]::SetEnvironmentVariable("PEDAGIO_DIGITAL_SENHA", "<senha>", "User")
# uso recorrente (recomendado): capturar sessão logada
[Environment]::SetEnvironmentVariable("PEDAGIO_DIGITAL_COOKIE", "<cookie completo>", "User")
[Environment]::SetEnvironmentVariable("PEDAGIO_DIGITAL_CSRF", "<x-csrf-token>", "User")
# feche e reabra o terminal / Cursor para aplicar
```

Em HTTP 401/403, a sessão expirou — recapturar `COOKIE`/`CSRF` (ou refazer login com captcha fresco).

## Resumo rápido

```bash
# Cadastrar placa nova (após cadastro-veiculo)
npx tsx src/run.ts pedagio-digital register --placa ABC1D23 [--modelo PEUGEOT]

# Excluir placa (ao inativar o veículo)
npx tsx src/run.ts pedagio-digital delete --placa ABC1D23 [--dry-run]

# Listar veículos / passagens
npx tsx src/run.ts pedagio-digital veiculos
npx tsx src/run.ts pedagio-digital passagens --placa ABC1D23 --status aberto

# Conferir se a frota ATIVA (veiculos.json, ativo!==false) está cadastrada no portal
npx tsx src/run.ts pedagio-digital conferir            # só relatório
npx tsx src/run.ts pedagio-digital conferir --registrar # cadastra as faltantes (só ativas)

# Sincronizar pedágios em aberto → cliente-despesas.json (skill sync-pedagios)
npx tsx src/run.ts sync-pedagios --placa ABC1D23 --dry-run
```

Relatório de lote: `relatorios/sync/_sync_pedagios.json`.

## Código (`src/lib/pedagioDigital/`)

| Módulo | Função |
|--------|--------|
| `auth.ts` | Login (CPF+senha) → sessão em cache; override por cookie/csrf; headers. |
| `client.ts` | `bffFetchRaw`, `bffFetchJson`, `pickArray` (HTTP de baixo nível). |
| `veiculos.ts` | `registrarPlaca`, `excluirPlaca`/`excluirPlacaPorPlaca`, `listarVeiculos`, `marcaDeMarcaModelo`. |
| `passagens.ts` | `listarPassagens`, `extrairPassagens`, normalização de passagem. |
| `syncPedagios.ts` | Orquestra passagens em aberto → `cliente-despesas.json`. |
| `index.ts` | Barrel. |

CLI: `src/cli/pedagioDigital.ts` (subcomandos) e `src/cli/syncPedagios.ts` (sync).

## Skills que usam esta tool

| Skill | CLI | Destino |
|-------|-----|---------|
| **sync-pedagios** | `sync-pedagios` | `database/cliente-despesas.json` (`Pedágio`) |
| **cadastro-veiculo** | `pedagio-digital register` | conta pedagiodigital.com (veículo novo) |

## Extensão

Novo endpoint: função em `src/lib/pedagioDigital/` (ex.: `passagens.ts`), re-export no `index.ts`, subcomando em `src/cli/pedagioDigital.ts` se precisar de CLI.
