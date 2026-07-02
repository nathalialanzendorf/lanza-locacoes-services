---
name: sync-cliente
description: >-
  Syncs Rastreame motoristas with database/clientes.json. Local DB is source of
  truth. Idempotent pull/push. Use for sync cliente, sync motoristas, clientes Rastreame.
---

# Sync cliente — Rastreame ↔ clientes.json

Sincroniza clientes (motoristas) entre o Rastreame e `database/clientes.json`.

## Regra de dados (igual à `cadastro-cliente`)

- **Campos nativos** sincronizados: `nome`, `cpf`, `cnh` (número), `categoriaCnh`, `vencimentoCnh`, `contato` (celular/e-mail).
- **Push:** campos da CNH e **endereço** sem campo nativo vão para **`observacao`** no Rastreame (secções **CNH** + **ENDEREÇO**) — ver formato na skill **cadastro-cliente** (`buildMotoristaObservacao` em `src/lib/rastreame/motorista.ts`).
- **Pull:** `observacao` **não é lida** — endereço e demais campos extras ficam só na database e são **preservados** no merge (não-destrutivo; só preenche lacunas; usar `--force-pull` para deixar o Rastreame sobrescrever os nativos).

## CLI

> O comando continua `sync-motoristas` (entidade do Rastreame = *motorista*).

```bash
npx tsx src/run.ts sync-motoristas
npx tsx src/run.ts sync-motoristas --dry-run --pull-only
```

| Opção | Efeito |
|-------|--------|
| `--dry-run` | Simula sem gravar local nem chamar POST/PUT |
| `--pull-only` | Só importa Rastreame → `clientes.json` |
| `--push-only` | Só exporta `clientes.json` → Rastreame (nativos + `observacao`) |
| `--force-pull` | Rastreame sobrescreve o local (espelho exato dos nativos) |
| `--force-push` | Empurra todos os clientes elegíveis, mesmo já sincronizados |

> Por defeito: push (local → Rastreame) e depois pull (Rastreame → local).

## Importação completa (pull)

- O pull busca o **detalhe** de cada motorista (a listagem traz só resumo) e importa os campos nativos.
- Casa registos por **`rastreameMotoristaKey` → CPF → CNH → nome normalizado** (o nome evita duplicar quem já existe localmente sem CPF/CNH casado).
- Cliente ausente no Rastreame é **inativado** localmente (não apagado).

## Push (nativos + observação)

- PUT/POST enviam campos nativos **e** `observacao` (dados extras da CNH).
- Se o motorista já existir no Rastreame (casado por CNH/nome), faz **PUT** para atualizar (incluindo `observacao`).
- Antes de POST usa `findMotorista(cnh, nome)` para não duplicar.
- **Inativação só local (push normal):** clientes com `ativo === false` **não** entram no push habitual. Com **`--force-push`**, inativos **com** `rastreameMotoristaKey` são atualizados (dados + `observacao`) e **reinativados** no Rastreame ao final — permanecem inativos localmente e remotamente.
- O pull continua atualizando o local com o dado do Rastreame, independente do status. Ver regra em `.cursor/rules/lanza-tools.mdc`.

## Idempotência

Reexecutar é seguro — ver [`_idempotencia.md`](../_idempotencia.md).

## Skills relacionadas

- **cadastro-cliente** (mesma regra de dados), **importar-clientes-rastreame**.
- Tool **Rastreame** (`.cursor/tools/rastreame/`).
