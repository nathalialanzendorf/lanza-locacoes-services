---
name: cadastro-movimentacao
description: >-
  Registra movimentação de locatários e veículos em database/locacoes.json: locado,
  reserva (carro substituto), manutenção (cliente sem veículo), troca de veículo e
  outros períodos. Sugere ganho/desconto/diárias para relatorio-prestacao-contas.
  Use ao registrar troca de veículo, veículo em manutenção, reserva, locação ativa,
  ou ao preparar prestação de contas a partir de locacoes.json.
---

# Cadastro de movimentação (locatário ↔ veículo)

Skill para a **linha do tempo operacional**: quando o cliente **está com um veículo**,
**fica sem veículo** (manutenção), **recebe reserva** ou **troca de placa** — tudo que
não é só “gerar contrato”, mas o **uso real** no período.

Persiste em `database/locacoes.json` (lib `src/lib/locacoesDb.ts`, CLI `locacoes`).
Gera **sugestões** para **relatorio-prestacao-contas** (validar com o utilizador; nunca
montar `entrada.json` sozinha).

> **Contrato vs movimentação:** **cadastro-contrato** (`criar` / `renovar` / `encerrar`)
> trata Word/PDF, `contratos.json` e vínculo Rastreame. **cadastro-movimentacao** trata
> o que aconteceu na rua (quem teve qual carro, quando parou, reserva, etc.).

## Quando usar

| Situação | `situacao` | O que registrar |
|----------|------------|-----------------|
| Cliente locando o veículo normalmente | `locado` | Período com condutor, valores semanal/diária |
| Veículo do contrato parado (oficina, cliente sem carro) | `manutencao` | Período sem condutor; sem valores cobrados |
| Cliente recebe **outro** veículo enquanto o dele para | `reserva` | Placa reserva + `substituiPlaca` da parada |
| **Troca definitiva** de veículo (novo contrato) | *(contrato)* + `locado` | **cadastro-contrato** encerrar (`troca`) + `criar`/`renovar`; aqui fecha `locado` antigo e abre `locado` na nova placa |
| Fim da locação / devolução | *(contrato)* | **cadastro-contrato encerrar**; aqui encerrar período `locado` (`fim`) |

## Modelo de dados

Cada registro é um **período** de um veículo (schema em `locacoes.json` → `schemaLocacao`):

| Campo | Conteúdo |
|---|---|
| `situacao` | **`locado`** \| **`manutencao`** \| **`reserva`** |
| `inicio` / `fim` | `DD/MM/AAAA` (`fim` vazio = vigente/em aberto) |
| `condutor` | cliente (`clientes.json`) por nome/CPF/id — usual em `locado`; opcional em reserva |
| `contratoId` | uuid em `contratos.json` (opcional) |
| `tipoLocacao` | `diaria` \| `semanal` \| `mensal` (`locado`/`reserva`; vazio em `manutencao`) |
| `valorCobrado` | valor **por unidade** cobrado do cliente |
| `valorPago` | valor **por unidade** repassado ao parceiro |
| `substituiPlaca` | em **reserva**, placa do veículo em manutenção que está a substituir |

**Taxa de controle:** `valorCobrado − valorPago` (tipicamente **R$ 150/semana** em veículo de parceiro). Em `manutencao` não há valores (parado).

## Cadastrar / editar / excluir

```bash
# Locação ativa (cliente com o veículo do contrato)
npx tsx src/run.ts locacoes add --placa MLN-0B87 --situacao locado \
  --inicio 01/06/2026 --tipo semanal --cobrado 500 --pago 350 --condutor "Fulano de Tal"

# Veículo parado — cliente sem carro (manutenção)
npx tsx src/run.ts locacoes add --placa ABC-1D23 --situacao manutencao \
  --inicio 10/06/2026 --fim 16/06/2026 --obs "Cliente sem veículo — troca de motor"

# Reserva: outro veículo para o mesmo cliente enquanto ABC-1D23 para
npx tsx src/run.ts locacoes add --placa XYZ-9A88 --situacao reserva \
  --inicio 10/06/2026 --fim 16/06/2026 --tipo diaria --pago 71.42 \
  --substitui ABC-1D23 --condutor "Fulano de Tal"

npx tsx src/run.ts locacoes listar --placa MLN-0B87
npx tsx src/run.ts locacoes add --id <uuid> ...   # atualiza
npx tsx src/run.ts locacoes excluir --id <uuid>
```

Sempre **confirmar o resumo** com o utilizador antes de gravar.

### Fluxo típico — troca por manutenção (reserva)

1. **Fechar** (ou definir `fim`) no `locado` da placa original, se ainda aberto.
2. **`manutencao`** na placa original (cliente sem aquele carro).
3. **`reserva`** na placa substituta, com `--substitui` apontando para a placa parada.
4. Ao voltar: fechar reserva e manutenção; reabrir `locado` na placa original **ou** seguir fluxo de **troca definitiva** via **cadastro-contrato**.

### Fluxo típico — troca definitiva de veículo

1. **cadastro-contrato encerrar** contrato antigo (`--motivo troca`).
2. **cadastro-contrato criar** (ou `renovar` se mesmo par cliente+placa nova) no novo veículo.
3. Aqui: encerrar `locado` na placa antiga; abrir `locado` na placa nova (novo condutor/período).

## Sugerir para a prestação de contas

```bash
npx tsx src/run.ts locacoes sugerir --competencia 06/2026
npx tsx src/run.ts locacoes sugerir --competencia 06/2026 --placa MLN-0B87
npx tsx src/run.ts locacoes sugerir --competencia 06/2026 --json
```

- **`ganhoItens`** — segmentos `locado` + `reserva` (por `valorPago`).
- **`manutencaoItens`** — uma linha por registro `manutencao` (diárias paradas).

Copiar para `entrada.json` da **relatorio-prestacao-contas**: `ganho.itens` ← `ganhoItens`; `descontoManutencao.itens` ← `manutencaoItens`.

## Idempotência

- `id` uuid; `add` sem `--id` cria, com `--id` atualiza. `sugerir`/`listar` só leitura.

## Skills relacionadas

- **cadastro-contrato** — contrato legal, `contratoId`, encerramento/troca (`criar`/`renovar`/`encerrar`).
- **relatorio-prestacao-contas** — consome sugestões de ganho/desconto/diárias.
- **cadastro-despesa** — gastos do proprietário (seguro, IPVA) em `parceiro-despesas.json`.

## Privacidade

Condutor e períodos ligam-se a clientes reais — não commitar dados sensíveis em repositório público.
