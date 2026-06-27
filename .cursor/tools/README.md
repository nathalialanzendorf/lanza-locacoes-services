# Ferramentas Lanza (tools)

Integrações externas e CLIs auxiliares. **Não são skills** — o agente consulta esta pasta quando precisa de auth, endpoints ou comandos de execução.

## Skills vs tools vs MCP

| Camada | Onde | Papel |
|--------|------|--------|
| **Skill** | `.cursor/skills/<nome>/SKILL.md` | Fluxo de **negócio** (cadastrar cliente, contrato, recebimento, relatório). O *quê* e *quando*. |
| **Tool** | `.cursor/tools/` + `src/lib/` + `src/run.ts` | **Integração técnica** (Rastreame, DETRAN SC). Auth, CLI, mapeamento API → JSON local. |
| **MCP** | Config Cursor (opcional) | Só se expuser APIs como servidor MCP; **neste repo** usamos CLI TypeScript, não MCP. |

Regra do projeto: skills de domínio **delegam execução** às tools (shell `npx tsx src/run.ts …`). Skills **`sync-infracoes`** e **`sync-ipva-licenciamento`** são fluxos de negócio que usam a tool DETRAN; **Rastreame** não tem skill dedicada — só tool.

## Índice

| Tool | Documentação | Código | CLI |
|------|--------------|--------|-----|
| **Rastreame** | [rastreame/README.md](rastreame/README.md) | `src/lib/rastreame/` | `rastreame`, `rastreame-gastos`, `importar-clientes-rastreame`, `rastreame-lancar-semanal`, `renegociar-debitos` |
| **DETRAN SC** | [detran-sc/README.md](detran-sc/README.md) | `src/lib/detranSc/` | `sync-infracoes`, `sync-ipva-licenciamento` |

## Quando ler tools (checklist do agente)

1. Utilizador pede ação no **Rastreame** → `tools/rastreame/` (via skill de cadastro).
2. Utilizador pede **sync multas / infrações DETRAN** → skill **`sync-infracoes`** (+ tool `detran-sc/`).
3. Utilizador pede **sync IPVA / licenciamento DETRAN** → skill **`sync-ipva-licenciamento`** (+ tool `detran-sc/`).
4. Skill de cadastro manda “executar no site/API” → abrir tool, correr CLI, reportar stdout.

## Extensão

Nova integração externa:

1. Implementar em `src/lib/<nome>/`.
2. Expor em `src/run.ts`.
3. Documentar em `.cursor/tools/<nome>/README.md`.
4. Referenciar na skill de negócio; para DETRAN, manter skills `sync-infracoes` / `sync-ipva-licenciamento` que apontam à tool.
