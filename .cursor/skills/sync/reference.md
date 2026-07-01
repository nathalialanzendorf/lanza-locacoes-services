# Sync — referência dos agentes paralelos

Repo: `d:\Dropbox\Aworklanza` (ajustar se necessário).

## Prompts dos 7 agentes

Copiar cada bloco para um `Task` com `subagent_type: shell`, `run_in_background: true`.

### Agente 1 — Pedágios (`sync-pedagios`)

```
Execute sync-pedagios in repo d:\Dropbox\Aworklanza.

1. npx tsx src/run.ts sync-pedagios
2. npx tsx src/run.ts sync-gastos-gerais --push-only
3. Ler relatorios/sync/_sync_pedagios.json se existir

Se 401/sessão: tentar pedagio-digital login; se captcha interativo, reportar.

Return: exit codes, novos/atualizados, erros auth, count condutorConfirmado:false.
Não bloquear em confirmação de condutor.
```

### Agente 2 — DETRAN SC (`sync-infracoes` + `sync-ipva-licenciamento`)

```
Execute DETRAN SC sync in repo d:\Dropbox\Aworklanza.

1. npx tsx scripts/detranSolver.ts
   (login gov.br no Chrome → JWT capturado → Chrome FECHA sozinho → frota via API)
2. npx tsx src/run.ts sync-gastos-gerais --push-only
3. npx tsx src/run.ts sync-manutencao
4. Relatórios: relatorios/sync/_sync_infracoes.json, _sync_ipva_licenciamento.json

Return: exit codes, veículos processados, novos/atualizados, auth/captcha, pendentes condutor.
```

### Agente 3 — DETRAN RS

```
Execute sync-detran-rs in repo d:\Dropbox\Aworklanza.

1. npx tsx src/run.ts sync-detran-rs
2. npx tsx src/run.ts sync-manutencao --categoria IPVA

Precisa DETRAN_RS_AUTH / DETRAN_RS_USER_ID. HTTP 401 = token expirado.

Return: exit codes, veículos RS, stats IPVA/licenciamento, erros auth.
Relatório: relatorios/_tmp/sync/_sync_detran_rs.json
```

### Agente 4 — Motoristas (`sync-cliente`)

```
Execute sync-cliente in repo d:\Dropbox\Aworklanza.

npx tsx src/run.ts sync-motoristas

Return: exit code, push/pull (criados/atualizados/inativados/ignorados), erros Rastreame.
```

### Agente 5 — Rastreáveis (`sync-veiculo`)

```
Execute sync-veiculo in repo d:\Dropbox\Aworklanza.

npx tsx src/run.ts sync-rastreaveis

Return: exit code, push/pull, FIPE, erros (ex. placa sem dispositivo no Rastreame).
```

### Agente 6 — Gastos gerais (`sync-recebimentos`)

```
Execute sync-recebimentos in repo d:\Dropbox\Aworklanza.

npx tsx src/run.ts sync-gastos-gerais

Return: exit code, push/pull (novos/atualizados/baixados/ignorados), erros.
```

### Agente 7 — Seguro (`sync-seguro`)

```
Execute sync-seguro in repo d:\Dropbox\Aworklanza.

1. npx tsx src/run.ts sync-seguro --ano 2026
   (pasta: config/lanza_paths.json → seguroComprovantesDir)
2. npx tsx src/run.ts sync-manutencao --categoria Seguro

Return: exit codes, boletos novos/atualizados, placas sem veículo, push manutenção, erros.
```

## Subconjuntos

| Pedido do utilizador | Agentes |
|----------------------|---------|
| só pedágio | 1 |
| só DETRAN / multas / IPVA | 2 + 3 |
| só Rastreame | 4 + 5 + 6 |
| só seguro | 7 |
| sync externo (Pedágio + DETRAN) | 1 + 2 + 3 |
| sync Rastreame + seguro | 4 + 5 + 6 + 7 |

## Conflitos de escrita

Vários agentes podem tocar `cliente-despesas.json` ou `parceiro-despesas.json`. Em produção isso é aceitável (idempotente); se houver erro de I/O, re-rodar o agente afetado.

## Relatórios úteis pós-sync

| Ficheiro | Origem |
|----------|--------|
| `relatorios/sync/_sync_pedagios.json` | Pedágios |
| `relatorios/sync/_sync_infracoes.json` | DETRAN SC infrações |
| `relatorios/sync/_sync_ipva_licenciamento.json` | DETRAN SC IPVA/lic |
| `relatorios/_tmp/sync/_sync_detran_rs.json` | DETRAN RS |

## Credenciais (checklist rápido)

| Integração | Variáveis |
|------------|-----------|
| Pedágio Digital | `PEDAGIO_DIGITAL_*` ou `pedagio-digital login` |
| DETRAN SC | `DETRAN_SC_AUTH`, `DETRAN_SC_EMPRESA` + login gov.br |
| DETRAN RS | `DETRAN_RS_AUTH`, `DETRAN_RS_USER_ID` |
| Rastreame | cookies/token em env (tool `.cursor/tools/rastreame/`) |
