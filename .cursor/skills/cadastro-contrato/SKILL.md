---
name: cadastro-contrato
description: >-
  CRUD de contratos de locação Lanza com ação obrigatória criar | renovar | encerrar:
  gerar Word/PDF, sincronizar database/contratos.json, efetivar encerramento e vínculo
  cliente↔veículo (local + Rastreame). Antes de gerar, confirmar com o operador como
  será pago o caução e a 1ª semana (integral ou parcelado). Use when the user asks
  contrato, locação, gerar contrato, renovação, encerrar contrato (efetivar), ou
  database/contratos.json.
---

# Cadastro de contrato de locação

Skill **única** para contratos Lanza. **Sempre** informe a ação como **primeiro argumento**:

| Ação | Quando usar |
|------|-------------|
| **`criar`** | Primeiro contrato do par **cliente + veículo** (versão v1) |
| **`renovar`** | Nova versão (v2, v3…) **após** encerramento do contrato anterior do mesmo par |
| **`encerrar`** | Efetivar encerramento no database (após relatório de acerto) |

```bash
npx tsx src/run.ts cadastro-contrato criar --placa PLACA --cpf CPF --semana VALOR --caucao VALOR
npx tsx src/run.ts cadastro-contrato renovar --placa PLACA --cpf CPF --semana VALOR --caucao VALOR
npx tsx src/run.ts cadastro-contrato encerrar "<pasta>" --data DD/MM/AAAA --motivo devolvido
```

> **Nunca** omita a ação (`criar`/`renovar`/`encerrar`). Alias legado: `gerar` → `criar`.

O **acerto financeiro** (multas, parcelas, diárias, caução) é só cálculo — skill **relatorio-encerramento-contrato**. Depois de validar o relatório, use **`cadastro-contrato encerrar`**.

## ⚠️ Local do contrato — SEMPRE dentro da pasta do veículo

A pasta `DD.MM.AAAA - Nome` do contrato **deve ficar dentro da pasta do veículo locado**
(ex.: `D:\Dropbox\Aluguel Carros\Felipe - FORD FOCUS 2013-2014\27.06.2026 - Juliano Foizer Silveira`),
**nunca na raiz** `Aluguel Carros`.

- O gerador resolve o destino por: `--contratos-dir` explícito → **`pastaVeiculo`** do veículo
  (em `database/veiculos.json`) → raiz padrão. Ou seja, ele só acerta a pasta sozinho se o
  veículo tiver o campo `pastaVeiculo` preenchido.
- **Antes de gerar, confirme** que o veículo tem `pastaVeiculo` em `veiculos.json`.
  - **Se faltar:** preencha com o nome da pasta do veículo (ex.: `"Felipe - FORD FOCUS 2013-2014"`,
    relativo à raiz; também aceita caminho absoluto) **ou** passe `--contratos-dir "…\Pasta do veículo"`.
  - Nunca gere na raiz: se cair na raiz, **mova** a pasta para dentro do veículo e **re-sincronize**
    (`cadastro-contrato sincronizar <novo caminho>`), depois **exclua o registro antigo** pelo `--id`
    (a chave de idempotência é `pastaContrato`, então mudar a pasta cria registro novo).
- **Depois de gerar, confira** que o caminho impresso (`Pasta -> …`) está dentro da pasta do veículo.

## Operações

| Ação | CLI | Efeito |
|------|-----|--------|
| **`criar`** | `cadastro-contrato criar …` | v1 — pasta Word/PDF + registro + vínculo cliente↔veículo |
| **`renovar`** | `cadastro-contrato renovar …` | v2+ — exige contrato anterior **encerrado** do mesmo par |
| **`encerrar`** | `cadastro-contrato encerrar …` | `status=encerrado`, remove vínculo, inativa cliente |
| *(aux.)* sincronizar | `cadastro-contrato sincronizar <pasta>` | Re-lê Word → `contratos.json` |
| *(aux.)* excluir | `cadastro-contrato excluir …` | Remove registro (não apaga pasta) |

### Validação criar vs renovar

- **`criar`:** falha se já existir **qualquer** contrato anterior do mesmo cliente+placa, ou se houver contrato **ativo**.
- **`renovar`:** falha se **não** houver contrato anterior, ou se o anterior ainda estiver **ativo** (encerre primeiro).

### Campos de encerramento (`contratos.json`)

| Campo | Valores |
|-------|---------|
| `dataEncerramento` | `DD/MM/AAAA` |
| `motivoEncerramento` | `devolvido` \| `recuperado` \| `troca` |
| `quebraContrato` | `true` se encerramento antes do fim previsto (retenção caução). **`troca` nunca é quebra** |
| `versao` | 1, 2, 3… por par cliente + veículo (renovações) |

> **Motivo `troca`:** o cliente trocou de veículo — **sempre** há um **novo contrato** (`criar` ou
> `renovar` conforme o par) com **outro veículo**. Não é quebra (a caução **transfere** para o novo
> contrato), então `quebraContrato = false` por padrão (sem retenção).

## Status do cliente segue o contrato (local + Rastreame)

O status do **cliente/motorista** e o **vínculo motorista↔veículo** acompanham o ciclo de
vida do contrato e são refletidos **no `database/clientes.json` E no Rastreame** (exceção
autorizada à regra "Inativação só local" — ver `.cursor/rules/lanza-tools.mdc`):

### Database local (fonte da verdade)

| Ação | `clientes.json` | `veiculos.json` |
|------|-----------------|-----------------|
| `criar` / `renovar` | `ativo: true`, `rastreameMotoristaKey`, entrada em `rastreameVinculos[]` | `clienteVinculadoId` |
| `encerrar` | remove item de `rastreameVinculos[]`; `ativo: false` se sem outro contrato | `clienteVinculadoId: null` |

Implementação local: `src/lib/contratoVinculoDb.ts`.

### Ao `criar` / `renovar` (local + Rastreame)

**Local:** `ativo: true`, persiste `rastreameMotoristaKey`, adiciona `rastreameVinculos[]`, define `clienteVinculadoId` no veículo.

**Rastreame:**
1. Consulta motoristas em `/keek/rest/motorista` (inclui inativos).
2. Se o motorista já existe e está **inativo**, reativa com `POST /keek/rest/motorista/{key}`.
3. Se não existir no Rastreame, replica o cadastro local (`replicarClienteNoRastreame`).
4. **Vincula** motorista ao rastreável:
   `POST /keek/rest/motorista/{motoristaKey}/{rastreavelKey}/`

### Ao `encerrar` (local + Rastreame)

**Local:** remove entrada de `rastreameVinculos[]`, zera `clienteVinculadoId`; `ativo: false` se sem outro contrato.

**Rastreame:**
1. **Sempre** remove o vínculo deste veículo:
   `DELETE /keek/rest/motorista/{motoristaKey}/{rastreavelKey}?force=true`
2. **Inativa** o motorista com `DELETE /keek/rest/motorista/{key}` —
   **exceto** se ainda tiver **outro contrato ativo** (ex.: locatário com 2 veículos); nesse
   caso só remove o vínculo deste veículo e mantém o motorista ativo.

- O database local é **fonte da verdade**; o Rastreame é **best-effort** (falha → `[aviso]`).
- Implementação: `src/lib/contratoClienteStatus.ts`, `src/lib/contratoVinculoDb.ts`, `src/lib/rastreame/motorista.ts`.

## ⚠️ Confirmação obrigatória — caução e pagamento semanal

**Antes de executar `criar` ou `renovar`**, o agente **sempre** confirma com o operador os dois
blocos abaixo. **Não** assuma pagamento integral nem omita parcelamento — pergunte
explicitamente, mesmo que o operador já tenha informado só `--semana` e `--caucao`.

### 1. Caução (cláusula 3.3)

Perguntar e registrar:

1. **Valor total da caução** (`--caucao`) — ex.: R$ 1.800,00
2. **Como será pago?**
   - **Integral na retirada** → só `--caucao` (padrão)
   - **Parte na retirada + saldo parcelado** → recolher:
     - Quanto **já foi pago** na retirada (ou quanto **ficou em aberto**)
     - **Quantas parcelas** do remanescente
     - **Valor de cada parcela** de caução
     - **Datas** de vencimento (DD/MM/AAAA), uma por parcela
     - Confirmar: `saldo em aberto = parcelas × valor parcela`
   - **Caução inteira diluída nas semanas** (sem entrada na retirada) → recolher:
     - **Quantas semanas** / parcelas
     - **Valor por semana** junto com o pagamento semanal
     - Confirmar: `parcelas × valor = --caucao`

**Resumo para o operador** (obrigatório repetir antes de gerar):

> Caução total R$ X. Pago na retirada: R$ Y. Remanescente R$ Z em N parcelas de R$ W
> (datas: …) **ou** diluído em N semanas de R$ W **ou** integral na retirada.

### 2. Pagamento semanal / 1ª semana (cláusula 3.2)

Perguntar e registrar:

1. **Valor semanal total** (`--semana`) — ex.: R$ 650,00
2. **A 1ª semana será paga integralmente na retirada?**
   - **Sim** → padrão (sem flags extras)
   - **Não, parcelada** → recolher:
     - **Quanto paga na retirada** (`--semana-entrada`)
     - **Em quantas semanas** quita o restante (`--semana-parcelas`)
     - **Quanto paga a mais por semana** até quitar (`--semana-valor-parcela`)
     - Confirmar: `entrada + parcelas × valor parcela = --semana`

**Resumo para o operador** (obrigatório repetir antes de gerar):

> Semanal R$ X. Na retirada: R$ Y. Restante R$ Z em N semanas de R$ W **ou** integral na retirada.

### 3. Conferência cruzada

Se **caução parcelada com datas** e **semanal definida**, informar o **total por dia de pagamento**
(semanal + parcela de caução), ex.: R$ 800 + R$ 150 = **R$ 950,00** nos dias acordados.

Só **depois** da confirmação explícita do operador (Sim / correto), montar as flags e executar a CLI.

## Fluxo do agente — `criar`

1. **Identificar** placa e cliente (nome ou CPF).
2. **Buscar** em `database/veiculos.json` e `database/clientes.json`.
3. **Se não existir:** skills **cadastro-veiculo** / **cadastro-cliente**.
4. **Conferir `pastaVeiculo`** do veículo (ver ⚠️ acima).
5. **Confirmar** que é **primeiro contrato** do par (v1) — senão usar **`renovar`**.
6. **Perguntar** período, início, hora, dia de pagamento.
7. **Confirmação obrigatória** — caução e pagamento semanal (secção acima):
   - valor total da caução + forma de pagamento (integral / saldo parcelado / diluída);
   - valor semanal total + 1ª semana integral ou parcelada.
   - Repetir resumo e aguardar **Sim** do operador.
8. **Executar:**

```bash
npx tsx src/run.ts cadastro-contrato criar --placa PLACA --cpf CPF --semana VALOR --caucao VALOR [opções]
```

9. Confirmar pasta dentro da pasta do veículo.

## Fluxo do agente — `renovar`

1. Mesmos passos de onboarding (placa, cliente, `pastaVeiculo`).
2. **Confirmar** que o contrato **anterior está encerrado** (`contratos.json`).
3. **Confirmação obrigatória** — caução e pagamento semanal (mesma secção de `criar`).
4. **Executar:**

```bash
npx tsx src/run.ts cadastro-contrato renovar --placa PLACA --cpf CPF --semana VALOR --caucao VALOR [opções]
```

5. Confirmar pasta dentro da pasta do veículo.

## Fluxo encerramento — `encerrar` (duas etapas)

1. **Relatório (só cálculo):** skill **relatorio-encerramento-contrato**
2. **Efetivar no database:**

```bash
npx tsx src/run.ts cadastro-contrato encerrar "D:/Dropbox/Aluguel Carros/.../05.05.2026 - Nome" \
  --data 26/06/2026 --motivo devolvido --quebra
```

`--motivo`: `devolvido` | `recuperado` | `troca` (troca **não** é quebra por padrão).

## Sincronizar pasta existente

```bash
npx tsx src/run.ts cadastro-contrato sincronizar "D:/Dropbox/Aluguel Carros/.../05.05.2026 - Nome"
```

## Importar todos os contratos em lote

```bash
npx tsx src/run.ts importar-contratos --dry-run
npx tsx src/run.ts importar-contratos
```

## CLI — flags (`criar` e `renovar`)

| Flag | Obrigatório | Descrição |
|------|-------------|-----------|
| `--placa` | sim | Placa em `veiculos.json` |
| `--cpf` ou `--cliente` | sim | Locatário em `clientes.json` |
| `--semana` | sim | Valor semanal (R$) |
| `--caucao` | sim | Caução (R$) |
| `--periodo` | não | `3 meses` (padrão), `6 meses`, `1 ano`, etc. |
| `--dia-pagamento` | não | ex. `todos os sábados` |
| `--cnh-arquivo` | não | Copia como `CNH.pdf` |
| `--contratos-dir` | não | Pasta do veículo (sobrepõe `pastaVeiculo`) |

### Parcelamento — cláusula 3.3 (caução)

Três cenários possíveis na geração do Word:

| Cenário | Quando usar | Flags |
|---------|-------------|-------|
| **Padrão** | Caução integral na retirada | só `--caucao` |
| **Saldo em aberto** | Parte já paga; restante parcelado com datas | `--caucao-saldo-aberto`, `--caucao-parcelas`, `--caucao-valor-parcela` e opcionalmente `--caucao-datas` |

**Datas das parcelas (`--caucao-datas`):** opcional. Se omitido, o sistema calcula automaticamente a partir de `--inicio` + `--dia-pagamento`: a **1.ª parcela cai na semana seguinte** ao 1.º dia de pagamento após a retirada (ex.: retirada 03/07, sábados → 11/07, 18/07, …). Helper: `gerarDatasParcelasCaucao()` em `src/lib/caucaoParcelas.ts`. Ao cadastrar despesas, usar as **mesmas datas** — skill **`cadastro-recebimento`**.
| **Caução semanal** | Caução inteira diluída em N semanas | `--caucao-parcelas`, `--caucao-valor-parcela` (sem saldo/datas; `parcelas × valor` = `--caucao`) |

**Exemplo — saldo em aberto** (cláusula 3.3 com datas e total semanal):

Caução R$ 1.800; R$ 300 em aberto em 2× R$ 150, junto com semanal R$ 800 → total R$ 950 nos dias 22/06 e 29/06:

```bash
npx tsx src/run.ts cadastro-contrato criar --placa PLACA --cpf CPF \
  --semana 800 --caucao 1800 \
  --caucao-saldo-aberto 300 --caucao-parcelas 2 --caucao-valor-parcela 150 \
  --caucao-datas 22/06/2026,29/06/2026
```

Texto gerado na 3.3 (após "entre outras despesas"):

> Onde ficou em aberto R$300,00 (trezentos reais) e será pago em 2 (duas) parcelas no valor de R$150,00 (cento e cinquenta reais) juntamente com valor semanal totalizando R$950,00 nos dias 22/06/2026 e 29/06/2026.

**Exemplo — caução parcelada em todas as semanas** (R$ 1.500 em 15× R$ 100):

```bash
npx tsx src/run.ts cadastro-contrato criar --placa PLACA --cpf CPF \
  --semana 650 --caucao 1500 \
  --caucao-parcelas 15 --caucao-valor-parcela 100
```

### Parcelamento — cláusula 3.2 (primeira semana)

Quando a 1ª semana não é paga integralmente na retirada — entrada parcial + restante nas próximas semanas:

```bash
npx tsx src/run.ts cadastro-contrato criar --placa PLACA --cpf CPF \
  --semana 650 --caucao 1500 \
  --semana-entrada 150 --semana-parcelas 4 --semana-valor-parcela 125
```

Validação: `entrada + parcelas × valor` deve fechar com `--semana` (ex.: 150 + 4×125 = 650).

Via JSON (`dados.json`), use os objetos `caucaoParcelas`, `caucaoSemanalParcelado` ou `semanaParcelas` em `GerarContratoDados` (ver `src/lib/docxGerar.ts`).

Modo JSON legado (inclua `"acao": "criar"` ou `"renovar"` no JSON):

```bash
npx tsx src/run.ts cadastro-contrato criar "relatorios/_dados_contrato_tmp.json"
```

## Aliases legados (run.ts)

- `gerar-contrato` → `cadastro-contrato criar`
- `registrar-contrato` → `cadastro-contrato sincronizar`
- `registrar-encerramento-contrato` → `cadastro-contrato encerrar`

## Idempotência

- **`sincronizar`:** chave `pastaContrato` — reexecutar **atualiza** `contratos.json`, não duplica.
- **`criar`/`renovar`:** cria ficheiros Word/PDF; repetir pode sobrescrever na mesma pasta (confirmar com operador).
- Ver [`_idempotencia.md`](../_idempotencia.md).

## Skills relacionadas

- **cadastro-cliente**, **cadastro-veiculo** — onboarding antes de `criar`/`renovar`.
- **cadastro-movimentacao** — após contrato: períodos `locado`/`manutencao`/`reserva` (troca, parada, reserva).
- **relatorio-encerramento-contrato** — acerto financeiro antes de `encerrar`.
- **cadastro-recebimento** — cadastrar despesas iniciais (semanal, caução, parcelas). Descrição das parcelas de caução: **`{n}x{N}`** (parcela × total) — ver secção **Formato das descrições — caução** nessa skill.

## Privacidade

CNH, CPF e endereço são dados sensíveis. Não commitar em repositório público.
