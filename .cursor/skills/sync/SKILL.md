---
name: sync
description: >-
  Orquestra todas as skills de sync Lanza em agentes paralelos (pedágios, DETRAN SC/RS,
  Rastreame motoristas/rastreáveis/gastos gerais, seguro). Use quando o utilizador pedir
  /sync, rodar todos os syncs, sync completo, sincronizar tudo ou executar todas as skills de sync.
---

# Sync — orquestração paralela

Skill **meta**: dispara **todas** as integrações de sync em **agentes paralelos** (`Task`, `subagent_type: shell`), cada um seguindo a skill filha correspondente.

> **Não** substitui as skills individuais — delega a elas. Detalhes de auth, campos e idempotência: skill filha + [reference.md](reference.md).

## Quando usar

- Utilizador: `/sync`, "rodar todos os syncs", "sync completo", "sincronizar tudo".
- Antes de rotinas semanais (cobrança + prestação de contas) — garantir base atualizada.

## Escopo padrão

| Agente | Skill filha | Comandos principais |
|--------|-------------|---------------------|
| 1 | `sync-pedagios` | `sync-pedagios` → `sync-gastos-gerais --push-only` |
| 2 | `sync-infracoes` + `sync-ipva-licenciamento` (SC) | `scripts/detranSolver.ts` → push gastos + `sync-manutencao` |
| 3 | DETRAN RS | `sync-detran-rs` → `sync-manutencao --categoria IPVA` |
| 4 | `sync-cliente` | `sync-motoristas` |
| 5 | `sync-veiculo` | `sync-rastreaveis` |
| 6 | `sync-fipe` | `sync-fipe` |
| 7 | `sync-recebimentos` | `sync-gastos-gerais` (pull + push) |
| 8 | `sync-seguro` | `sync-seguro --ano 2026` → `sync-manutencao --categoria Seguro` |

Ano do seguro: ler `seguroComprovantesDir` em `config/lanza_paths.json` (padrão `--ano 2026`).

## Fluxo do agente (obrigatório)

1. **Anunciar** ao utilizador que serão **8 agentes em paralelo** (lista acima).
2. **Lançar os 8 agentes numa única mensagem** — cada um com `run_in_background: true`, `subagent_type: shell`, prompts em [reference.md](reference.md).
3. **Ordem de arranque** (todos na mesma mensagem): agente 1 (Pedágio) primeiro na lista — sessão BFF expira em minutos; demais na sequência da tabela.
4. **Não bloquear** em confirmação de condutor (`condutorConfirmado: false`) — executar sync e **reportar** pendentes no resumo final.
5. **Aguardar** conclusão dos agentes; **consolidar** num único resumo (template abaixo).
6. **Passos interativos** (login gov.br DETRAN, captcha Pedágio): reportar claramente — **não** cancelar os outros agentes.

### Filtros opcionais

Se o utilizador pedir **apenas um domínio** (ex.: "sync só Rastreame"), lançar **só** os agentes correspondentes — ver secção "Subconjuntos" em [reference.md](reference.md).

## Resumo final (template)

```markdown
## Sync completo — DD/MM/AAAA HH:mm

| Agente | Exit | Destaques |
|--------|------|-----------|
| Pedágios | | novos/atualizados; auth? |
| DETRAN SC | | placas; infrações/IPVA; login gov.br? |
| DETRAN RS | | placas RS; 401 token? |
| Motoristas | | push/pull |
| Rastreáveis | | push/pull; erros placa |
| FIPE | | frota ativa; falhas marca/modelo |
| Gastos gerais | | push/pull |
| Seguro | | boletos; manutenção |

### Ação necessária
- [ ] … (tokens, login, cadastro manual)

### Pendentes pós-sync (não bloqueiam)
- Condutores a confirmar: N (pedágios/infrações)
```

## Regras

- **Repo:** raiz `Aworklanza`; comandos `npx tsx src/run.ts …` ou `npx tsx scripts/…`.
- **PowerShell:** usar `working_directory` no Shell — evitar `cd … &&` (falha no Windows).
- **Paralelo real:** uma mensagem, múltiplos `Task`; não serializar syncs longos.
- **Auth:** permitido ler/gravar env do utilizador (`SetEnvironmentVariable` User) — ver `.cursor/rules/lanza-tools.mdc`.
- **Idempotência:** reexecutar `/sync` é seguro — ver [`_idempotencia.md`](../_idempotencia.md).

## Skills relacionadas

Filhas: `sync-pedagios`, `sync-infracoes`, `sync-ipva-licenciamento`, `sync-cliente`, `sync-veiculo`, `sync-fipe`, `sync-recebimentos`, `sync-seguro`.

Prompts copy-paste dos agentes: [reference.md](reference.md).
