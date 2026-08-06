# Tool — DETRAN RS (PROCERGS / pcsdetran)

API REST em [pcsdetran.procergs.com.br](https://pcsdetran.procergs.com.br/) (portal `pcsdetran.rs.gov.br`). Consulta **placa + RENAVAM** de `database/veiculos.json`.

Diferente do DETRAN SC: é **uma única chamada GET** por veículo, **sem ticket nem captcha**.

```
GET /pcsdetran/rest/veiculos/{PLACA}/?renavam={RENAVAM}&contabiliza=false
```

| CLI | Destino | Conteúdo |
|-----|---------|----------|
| `sync-detran-rs` | `database/parceiro-despesas.json` (IPVA, Licenciamento) | IPVA em aberto + taxa de licenciamento |

Referência API: [reference.md](reference.md)

## Quando usar (roteamento por UF)

O campo **`ufRegistro`** do veículo (`database/veiculos.json`) decide a tool:

- `SC` ou ausente → tool **detran-sc**.
- `RS` → tool **detran-rs** (esta).

Os comandos `sync-infracoes` e `sync-ipva-licenciamento` **roteiam sozinhos**: placa RS é delegada a esta tool; na frota processam SC e depois RS. `sync-detran-rs` processa **só** `ufRegistro="RS"` (e a frota SC pula RS). Use `--no-rs`/`--sc-only` para forçar apenas SC.

> O endpoint do RS devolve o **resumo** das infrações (sem detalhe por multa) — por isso `sync-detran-rs` cobre IPVA/Licenciamento e **sinaliza** infrações para revisão manual.

## Autenticação (variáveis de ambiente do utilizador)

| Variável | Uso |
|----------|-----|
| `DETRAN_RS_AUTH` | Token Bearer (header `Authorization`) |
| `DETRAN_RS_USER_ID` | Header `X-User-Id` (base64 do CPF) |
| `DETRAN_RS_PFX_PATH` | **Certificado A1** (`.pfx`) p/ login gov.br (ou genérico `DETRAN_PFX_PATH`) |
| `DETRAN_RS_PFX_PASS` | Senha do `.pfx` (ou genérico `DETRAN_PFX_PASS`) |
| `DETRAN_RS_GOV_CPF` | CPF do gov.br (fallback CPF/senha — auto-preenche) |
| `DETRAN_RS_GOV_SENHA` | Senha do gov.br (fallback CPF/senha — auto-preenche) |
| `DETRAN_RS_TLS_INSECURE` | Opcional — `1` em redes com interceptação TLS |

O portal **não tem captcha próprio**: o acesso é **só via gov.br** (Login Cidadão / OAuth2). O `Authorization`/`X-User-Id` são emitidos **depois** do login gov.br. Tudo abaixo é **gratuito** (usa o certificado que você já tem + o openssl do Git for Windows). Nunca versionar no Git; não usar `.env` para credenciais.

### Login por certificado digital (recomendado — sem senha nem captcha)

O gov.br aceita o **certificado digital** por mTLS, **dispensando reCAPTCHA/2FA**. É o caminho mais robusto e **não precisa de nenhuma credencial em texto**.

```powershell
# Recomendado — Chrome real via CDP (captura passiva da rede):
.\scripts\login-detran-rs.ps1

# Com .pfx (importa certificado para o Windows):
.\scripts\login-detran-rs.ps1 -Pfx "C:\caminho\certificado.pfx" -PfxPass "<senha-pfx>"

# Perfil corrompido / login gov.br falhou:
.\scripts\login-detran-rs.ps1 -Fresh
```

Abre **Chrome real** (não Playwright), você faz login gov.br (certificado ou CPF/senha) e o script captura `Bearer` + `X-User-Id` da rede quando o portal carrega a frota.

### Fallback CPF/senha (você resolve o captcha)

```powershell
.\scripts\login-detran-rs.ps1 -Cpf "<cpf>" -Senha "<senha>"
```

Auto-preenche CPF/senha no browser (manual) e captura o token. Use `-Fresh` se a sessão gov.br falhar. O token dura algumas horas; ao expirar (`HTTP 401`), rode de novo.

### Captura manual (DevTools)

Em pcsdetran.rs.gov.br logado → DevTools → Network → pedido `veiculos/...` → copiar `Authorization` e `X-User-Id` para as variáveis.

## Resumo rápido

```bash
# Toda a frota RS (ufRegistro="RS")
npx tsx src/run.ts sync-detran-rs [--dry-run]

# Um veículo
npx tsx src/run.ts sync-detran-rs --placa PWH3A45

# A partir de um JSON salvo (sem chamar a API)
npx tsx src/run.ts sync-detran-rs --placa PWH3A45 --json resposta.json
```

Relatório de lote: `relatorios/sync/_sync_detran_rs.json`.

## O que o sync grava

| Origem no payload | Vira | Regra |
|-------------------|------|-------|
| `imposto.historico[].debitos[]` (situação não-paga) | IPVA (`parceiro-despesas`) | uma despesa por forma (cota única / parcela); exercícios liquidados são ignorados; valor = `valorTotalComDesconto` (com multa+juros) |
| `expedicaoDocumento.vlrLic` (> 0) | Licenciamento (`parceiro-despesas`) | taxa do exercício `exercRefLic`; vencimento de `txtSitLic`/`dtVencLicenciamento` |
| `infracao` (totais) | — | o endpoint só devolve **resumo** (qt/valor); **sem detalhe por multa** → fica como aviso para revisão manual |

## Idempotência

- **Chave `origem`:** `detran-rs/debitos/{PLACA}/{categoria}/{exercicio[-forma]}`.
- Reexecutar **atualiza** valores; **não duplica**. Origens RS e SC são distintas e nunca se fundem.

## Código

`src/lib/detranRs/` — `auth.ts`, `consulta.ts`, `mapDebitos.ts`, `syncVeiculo.ts` · CLI `src/cli/syncDetranRs.ts`

## Skills relacionadas

- **cadastro-veiculo** — gravar `ufRegistro` e `renavam`.
- **relatorio-prestacao-contas** — consome `parceiro-despesas.json` (IPVA/Licenciamento, inclusive RS).
