---
name: cadastro-contrato
description: >-
  CRUD de contratos de locação Lanza: gerar Word/PDF, sincronizar database/contratos.json,
  efetivar encerramento (data, quebra, devolvido/recuperado) e excluir registro.
  Use when the user asks contrato, locação, gerar contrato, cadastro contrato,
  encerrar contrato (efetivar), renovação, ou database/contratos.json.
---

# Cadastro de contrato de locação

Skill **única** para contratos Lanza: **cadastrar**, **editar/sincronizar**, **encerrar** (efetivar) e **excluir** registro em `database/contratos.json`, além de **gerar** `.docx`/`.pdf`.

O **acerto financeiro** (multas, parcelas, diárias, caução) é só cálculo — skill **relatorio-encerramento-contrato**. Depois de validar o relatório, use **cadastro-contrato encerrar** aqui.

## Operações

| Operação | CLI | Efeito |
|----------|-----|--------|
| **Cadastrar / gerar** | `cadastro-contrato gerar …` | Cria pasta Word/PDF + registro em `contratos.json` |
| **Editar / sincronizar** | `cadastro-contrato sincronizar <pasta>` | Re-lê `Contrato*.docx` e atualiza `contratos.json` |
| **Encerrar (efetivar)** | `cadastro-contrato encerrar <pasta> --data … --motivo …` | Grava `dataEncerramento`, `motivoEncerramento`, `quebraContrato`, `status=encerrado` |
| **Excluir** | `cadastro-contrato excluir <pasta\|--id uuid>` | Remove registro (não apaga pasta Word) |

### Campos de encerramento (`contratos.json`)

| Campo | Valores |
|-------|---------|
| `dataEncerramento` | `DD/MM/AAAA` |
| `motivoEncerramento` | `devolvido` \| `recuperado` |
| `quebraContrato` | `true` se encerramento antes do fim previsto (retenção caução) |
| `versao` | 1, 2, 3… por par cliente + veículo (renovações) |

## Fluxo do agente (gerar)

1. **Identificar** placa e cliente (nome ou CPF).
2. **Buscar** em `database/veiculos.json` e `database/clientes.json`.
3. **Se não existir:** skills **cadastro-veiculo** / **cadastro-cliente**.
4. **Perguntar** período, valor semanal, caução, início, dia de pagamento.
5. **Executar:**

```bash
npx tsx src/run.ts cadastro-contrato gerar --placa PLACA --cpf CPF --semana VALOR --caucao VALOR [opções]
```

6. Confirmar pasta `DD.MM.AAAA - Nome/` com `.docx`, `.pdf`, `CNH.pdf`.

## Fluxo encerramento (duas etapas)

1. **Relatório (só cálculo):** skill **relatorio-encerramento-contrato**
2. **Efetivar no database:**

```bash
npx tsx src/run.ts cadastro-contrato encerrar "D:/Dropbox/Aluguel Carros/.../05.05.2026 - Nome" \
  --data 26/06/2026 --motivo devolvido --quebra
```

`--motivo`: `devolvido` (devolução pelo locatário) ou `recuperado` (recolhimento).  
`--sem-quebra` se encerrar no fim natural do prazo sem retenção.

## Sincronizar pasta existente

```bash
npx tsx src/run.ts cadastro-contrato sincronizar "D:/Dropbox/Aluguel Carros/.../05.05.2026 - Nome"
```

## CLI gerar — flags

| Flag | Obrigatório | Descrição |
|------|-------------|-----------|
| `--placa` | sim | Placa em `veiculos.json` |
| `--cpf` ou `--cliente` | sim | Locatário em `clientes.json` |
| `--semana` | sim | Valor semanal (R$) |
| `--caucao` | sim | Caução (R$) |
| `--periodo` | não | `3 meses` (padrão), `6 meses`, `1 ano`, etc. |
| `--dia-pagamento` | não | ex. `todos os sábados` |
| `--cnh-arquivo` | não | Copia como `CNH.pdf` |

Modo JSON legado:

```bash
npx tsx src/run.ts cadastro-contrato gerar "relatorios/_dados_contrato_tmp.json"
```

## Aliases legados (run.ts)

- `cadastro-contrato` → `cadastro-contrato gerar`
- `registrar-contrato` → `cadastro-contrato sincronizar`
- `registrar-encerramento-contrato` → `cadastro-contrato encerrar` (motivo `devolvido` + quebra)

## Skills relacionadas

- **cadastro-cliente**, **cadastro-veiculo** — onboarding antes de gerar.
- **relatorio-encerramento-contrato** — acerto financeiro antes de efetivar encerramento.
- **cadastro-recebimento** — parcelas pagas (input do relatório).

## Privacidade

CNH, CPF e endereço são dados sensíveis. Não commitar em repositório público.
