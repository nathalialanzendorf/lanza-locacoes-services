# sync-infracoes — detalhe técnico (tool DETRAN SC)

> Fluxo de negócio: skill **`.cursor/skills/sync-infracoes/`**. Esta página é auth/CLI/API.

## Semântica DETRAN

| Bloco API | Significado | Ação |
|-----------|-------------|------|
| `infracoes` | Autuação notificada, sem boleto | Cobrável locatário (`quitadaDetran: false`) |
| `debitos` | Multas + IPVA/licenciamento misturados | Importar **só multas** |
| `historicoInfracoes` | Pagas no DETRAN | `quitadaDetran: true` — não cobrar no encerramento |

`paga` = locatário pagou à Lanza (≠ quitada DETRAN).

## CLI

```bash
npx tsx src/run.ts sync-infracoes
npx tsx src/run.ts sync-infracoes --placa QJB-0I83
npx tsx src/run.ts sync-infracoes --dry-run --placa QJB-0I83
npx tsx src/run.ts sync-infracoes --placa QJB-0I83 --json relatorios/_tmp/_detran_resposta.json
```

Relatório: `relatorios/sync/_sync_infracoes.json`.

## Fluxo operacional

1. Credenciais nas variáveis de ambiente do utilizador (ver [README.md](README.md)).
2. `--dry-run --placa X` em teste.
3. Sync frota ou placa.
4. Multas novas com `condutorConfirmado: false` → confirmar antes de cobrar.
5. Confirmar condutor: `gravar-cliente-despesa confirmar <autoInfracao>`.

## Campos gravados

- Chave: `autoInfracao`
- `origem`: `detran-sc`
- `categoria`: `Infração`

Ver [reference.md](reference.md) para API e módulos.
