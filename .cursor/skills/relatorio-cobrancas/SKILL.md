---
name: relatorio-cobrancas
description: >-
  Gera mensagens de cobrança prontas para WhatsApp a partir de templates e
  database/cliente-despesas.json. Action /relatorio-cobrancas com parâmetros
  tipo e escopo (cliente, veículo/placa ou todos). Tipos: pagamento-semanal,
  renegociacao, infracoes, pedagio, estacionamento-rotativo, manutencao.
  Use para cobrança WhatsApp, multa, pedágio, rotativo e pagamento semanal.
---

# Relatório de cobranças (WhatsApp)

Gera o **texto da cobrança** pronto para colar no WhatsApp. Skill **só leitura** (imprime e salva `.txt`); não altera bases.

> **Veículos particulares** (`"particular": true` em `veiculos.json`) **não geram cobrança** — não são de locação (sem locatário). O CLI recusa a placa com erro claro.

Cada mensagem tem um **modelo próprio** em `templates/cobrancas/`. O CLI lê o template, troca os campos `{...}` por dados do veículo/despesa e salva em `relatorios/_tmp/cobrancas/`.

## Tipos de cobrança

| Tipo | Template | Dados |
|---|---|---|
| 💰 **semanal** | `semanal-{1..4}-*.txt` | placa + marca/modelo (`veiculos.json`) |
| 🅿️ **estacionamento** | `estacionamento-rotativo.txt` | placa (texto fixo SigaPay Área Azul) |
| 🛣️ **pedagio** | `pedagio.txt` | placa (texto fixo CCR Via Costeira) |
| 🚦 **multa** | `multa.txt` | infrações em aberto (`cliente-despesas.json`) |
| 🤝 **renegociacao** | `renegociacao.txt` | soma das parcelas em aberto |
| 🔧 **manutencao** | `manutencao.txt` | soma das manutenções em aberto |
| 📋 **despesas em aberto** | `despesas-em-aberto.txt` | todas as despesas em aberto do escopo (mensagem dedicada) |

## Action `/relatorio-cobrancas`

Command em `.cursor/commands/relatorio-cobrancas.md`. Três parâmetros na invocação:

### Parâmetros (0 a 3 — omitir = **todos**)

| Parâmetro | Omitir significa |
|---|---|
| **tipo-despesa** | todos os tipos |
| **cliente** | todos os clientes |
| **veículo** | todos os veículos |

Pode informar **1, 2, 3 ou nenhum** parâmetro. Cliente e veículo são mutuamente exclusivos.

Exemplos:

```
/relatorio-cobrancas
/relatorio-cobrancas pagamento-semanal
/relatorio-cobrancas infracoes Daniel Damasceno
/relatorio-cobrancas pedagio RAH-4F54
/relatorio-cobrancas Daniel Damasceno
```

CLI: tipo → arg/`--tipo`; cliente → `--cliente`; veículo → `--placa`.

| Tipo | Alvos elegíveis |
|---|---|
| **pagamento-semanal** | `Locação semanal` + `ATRASADO` + em aberto + **contrato ativo** (cliente + placa) |
| **renegociacao** | categoria `Renegociação` em aberto |
| **infracoes** | infrações em aberto (não pagas, não quitadas DETRAN) |
| **pedagio** | categoria `Pedágio` em aberto |
| **estacionamento-rotativo** | categoria `Estacionamento` em aberto |
| **manutencao** | categoria `Manutenção` em aberto (valor > 0) |

Implementação: `src/lib/cobrancasAlvos.ts` (filtros) + `src/lib/cobrancasLote.ts` (geração).

```bash
npx tsx src/run.ts relatorio-cobrancas --listar
npx tsx src/run.ts relatorio-cobrancas pagamento-semanal --cliente "Daniel Damasceno"
npx tsx src/run.ts relatorio-cobrancas --placa RAH-4F54
```

**pagamento-semanal** gera, por alvo: tabela **semanal-atraso** (padrão obrigatório) + WhatsApp (dia **automático** por vencimento + hoje). Demais tipos: uma mensagem por placa (infrações: uma por multa).

Grava `.txt`, sidecars JSON por tipo (`dados-lote-*.json`) e **JSON consolidado para canvas** (`cobranca-{placa}-{cliente}-{data}.json`):
- **`--cliente`** ou **`--placa`**: um sidecar para o escopo filtrado.
- **Sem parâmetros**: um sidecar **por cliente** elegível (todas as placas/débitos do locatário, como `--cliente`).

Implementação sidecar: `src/lib/cobrancasRelatorioSidecar.ts` (`listarEscoposSidecar` + `salvarCobrancasSidecar`).

## Escalonamento do pagamento semanal

Contado a partir do **vencimento** (D0). O `--dia` do WhatsApp é **inferido automaticamente** pela data de hoje; use `--dia N` só para forçar um template.

| Data | Mensagem |
|---|---|
| **D0** (vencimento) | Ainda no prazo — **sem** mensagem de cobrança |
| **D+1** | Lembrete (`semanal-1-lembrete.txt`, dia 1) |
| **D+2** | Aviso (`semanal-2-regularizacao.txt`, dia 2) |
| **D+3** em diante | Bloqueio programado (`semanal-3-bloqueio.txt`, dia 3) |
| **Após pagar** | Confirmação (`semanal-4-regularizado.txt`, dia 4 — manual) |

Exemplo (vencimento 01/07): 01/07 em prazo · 02/07 lembrete · 03/07 aviso · 04/07 bloqueio.

**Data bloqueio** no resumo = **3º dia contando o vencimento** (vencimento + **2 dias**). Referência: última parcela em aberto no cálculo.

## Cobrança semanal — pagamento não realizado (padrão obrigatório)

Quando o pagamento semanal **não foi realizado**, **sempre** calcular e apresentar as tabelas
dia a dia neste padrão (antes de informar valor ao locatário ou montar baixa integral).

> Implementação: `src/lib/pagamentoSemanalCobranca.ts` · CLI abaixo.

### Valores

| Campo | Fórmula |
|---|---|
| **Total/dia em dia** | `valorSemanal ÷ 7` |
| **Total/dia atrasado** | `valorDiaria` (contrato, ex. R$ 120) |
| **Juros e multa/dia** | `valorDiaria − (valorSemanal ÷ 7)` (ex. R$ 27,14) |

### Período de cada parcela em aberto

Uma **tabela por vencimento** não pago, em ordem cronológica:

| Parcela | Início | Fim (tabela) |
|---|---|---|
| Com parcela seguinte (≤7 dias) | vencimento (inclusive) | véspera do próximo vencimento |
| Com lacuna até a próxima | vencimento (inclusive) | vencimento + **6 dias** (só a semana) |
| Última em aberto | vencimento (inclusive) | vencimento + **7 dias** (inclusive) |

### Situação por dia

| Situação | Quando |
|---|---|
| **Atrasado** | Dia ≥ vencimento **e** dia ≤ data do pagamento **e** dentro dos **7 dias da parcela** (vencimento +6) |
| **Em dia** | Demais dias do período da tabela (após o pagamento ou após a 1ª semana de atraso) |

**Juros e multa** só nos dias **Atrasado** — no máximo **7 diárias por parcela semanal**, mesmo que a próxima parcela em aberto esteja distante.

### Colunas da tabela (ordem fixa)

| Data | Dia | Situação | Juros e multa | Total/dia |

- **Juros e multa:** valor quando **Atrasado**; `—` quando **Em dia**.
- **Total/dia:** `valorDiaria` se Atrasado; `valorSemanal÷7` se Em dia.
- Subtotais: **Juros e multa** (soma) + **Total** da tabela.
- Várias parcelas: **Total geral** = soma dos totais de cada tabela.

### Resumo da cobrança WhatsApp (pagamento-semanal)

Bloco obrigatório antes da tabela e da mensagem (CLI, canvas e mensagem semanal enriquecida):

```
Data bloqueio: 30/06/2026
Base de cálculo: 04/07/2026

Vencimento em aberto: 27/06/2026
Juros e multa: R$ 189,98 (7 diárias)
Total semana: R$ 650,00

Vencimento em aberto: 04/07/2026
Juros e multa: R$ 27,14 (1 diária)
Valor semana: R$ 650,00

Total a devido : R$ 1.517,12 (8 dias em atraso)
```

| Campo | Regra |
|---|---|
| **Escalonamento (dia N)** | No template bloqueio/lembrete — **fora** do bloco resumo |
| **Base de cálculo** | `--data-pagamento` ou hoje |
| **Data bloqueio** | Última parcela no cálculo + **2 dias** (3º dia contando o vencimento) |
| **Juros e multa (por semana)** | Soma dos dias **Atrasado** até a base de cálculo (máx. 7 diárias/parcela) |
| **Total semana / Valor semana** | **Valor semanal do contrato** (nominal) |
| **Total a devido** | Soma (valor semanal + juros/multa) por parcela em aberto |

Implementação: `calcularResumoCobrancaSemanal()` · `formatResumoCobrancaSemanal()` · `formatResumoPorSemana()` em `pagamentoSemanalCobranca.ts`.

### CLI

```bash
npx tsx src/run.ts relatorio-cobrancas semanal-atraso --cliente "Daniel Damasceno" --data-pagamento 30/06/2026
npx tsx src/run.ts relatorio-cobrancas semanal-atraso --placa RAH-4F54 --vencimento 20/06/2026 --vencimento 27/06/2026 --data-pagamento 30/06/2026 --no-salvar
```

Sem `--vencimento`, lê despesas **ATRASADO** em aberto do cliente. Valores do contrato ativo
(`contratos.json`); override com `--valor-semanal` / `--valor-diaria`.

Grava `relatorios/_tmp/cobrancas/semanal-atraso-*.md` e `dados-semanal-atraso-*.json`.

**Canvas:** ao calcular cobrança semanal em atraso, criar canvas a partir do JSON (mesmo padrão
da secção Canvas abaixo).

Detalhes: `reference.md` nesta pasta.

## CLI

```bash
npx tsx src/run.ts relatorio-cobrancas semanal --placa AVU-6740 --dia 1
npx tsx src/run.ts relatorio-cobrancas estacionamento --placa AVU-6740
npx tsx src/run.ts relatorio-cobrancas pedagio --placa AVU-6740
npx tsx src/run.ts relatorio-cobrancas multa --placa QJB-0I83 [--auto P07MQ009QP]
```

Opções: `--no-salvar` (só imprime), `--out DIR` (padrão `relatorios/_tmp/cobrancas/`), `--nome NOME` (saudação personalizada).

Além dos `.txt`, cada tipo grava `dados-lote-{tipo}-{data}.json`. Grava também o sidecar **`cobranca-{placa}-{cliente}-{data}.json`** para o canvas:
- **`--cliente`** ou **`--placa`**: um sidecar para o escopo filtrado.
- **Sem parâmetros** (todos): um sidecar **por cliente** (veículo + débitos de outras placas); inclui ex-locatário com pendência.

## Saída obrigatória no fim do relatório

**Todo** relatório de cobrança com escopo **cliente** ou **placa** termina com, **nesta ordem**:

1. **Resumo** da cobrança semanal (`formatResumoCobrancaSemanal`) — quando em atraso (D+1+), com **juros por semana** e **Total a devido**
2. **Uma tabela semanal-atraso por semana em aberto** — colunas fixas: Data | Dia | Situação | Juros e multa | Total/dia; subtotais por tabela + **Total geral**
3. **Mensagens WhatsApp separadas** (`mensagensWhatsApp[]`) — **entregáveis para envio**:
   - **pagamento semanal** (template bloqueio/lembrete + resumo do atraso com juros por semana)
   - **despesas em aberto** (mensagem unificada com todas as pendências — manutenção, parcelas nominais, pedágio, etc.)
   - demais tipos dedicados (infrações, pedágio, …) **somente** quando não há mensagem unificada de despesas em aberto no escopo

**Manutenção:** quando o escopo gera a mensagem **despesas em aberto** (ex.: `--cliente` com todos os tipos), **não** enviar WhatsApp separado de manutenção — os itens já aparecem na lista unificada. Com **`--tipo manutencao`** isolado, mantém a mensagem dedicada (`manutencao.txt`).

As despesas em aberto aparecem **no início** do relatório/canvas (infrações, manutenção, parcelas, outros) — **não** há tabela consolidada no fim.

Vale para **pagamento-semanal** isolado, **todos os tipos** (`--cliente` / `--placa` sem `--tipo`) ou combinação de tipos: se existir parcela semanal ATRASADO, incluir as tabelas mesmo que o filtro não seja só pagamento-semanal.

### Formato WhatsApp — despesas em aberto

Mensagem **separada** em `mensagensWhatsApp[]` (tipo `despesas-em-aberto`):

```
📋 *Despesas em aberto* — RAH-4F54

Olá, Daniel!
Segue a listagem das despesas referente à locação do seu FIAT/MOBI LIKE que segue em aberto:

• MLX-2H34 · Troca de Pneu · R$ 320,00
• RAH-4F54 · Pagamento semanal - Sábado 27 · R$ 400,00

*Total em aberto: R$ 1.370,00*
```

O **total em aberto** reflete os valores nominais das despesas; o bloco semanal (na mensagem de pagamento semanal) distingue **total devido com juros/multa**.

Implementação: `gerarDespesasEmAberto()` em `cobrancas.ts` · `montarMensagensWhatsAppEscopo()` em `cobrancasRelatorioSidecar.ts`; bloco final na CLI (`relatorioCobrancasLote.ts`); sidecar grava um `.txt` por mensagem (`cobranca-*-whatsapp-{tipo}.txt`); canvas `cobranca.layout.tsx` (secções **Pagamento semanal em atraso** → **Mensagens WhatsApp**).

## Canvas (obrigatório junto ao TXT)

A CLI gera sidecar JSON + canvas automaticamente. Dois layouts:

| Modo | Quando | Layout | Agrupamento |
|---|---|---|---|
| **Completo** | sem parâmetros · `--cliente` | `cobranca.layout.tsx` | Um canvas por **cliente** (todas as placas/débitos) |
| **Infrações completo** | **só** `infracoes` (sem cliente/placa) | `relatorio-infracoes.layout.tsx` (= `cobranca-simples`) | Todos os veículos + totalizadores por placa |
| **Infrações resumido** | **só** `infracoes` (sem cliente/placa) | `relatorio-infracoes-resumido.layout.tsx` | Igual ao completo, título **(resumido)** |
| **Simples** | **só tipo** (ex. `pedagio`) | `cobranca-simples.layout.tsx` | **Por veículo** — tópico `{placa} · {marca/modelo} ({ano})` + tabela |
| **Simples** | **só `--placa`** | `cobranca-simples.layout.tsx` | **Por tipo de despesa** — tópico do tipo + tabela |

Tabela em ambos os modos simples: **Descrição · Placa · Data · Categoria · Valor** (só despesas do filtro).

- Sidecar completo: `cobranca-{placa}-{cliente}-{data}.json`
- Sidecar infrações: `relatorio-infracoes-{data}.json` (padrão); resumido só com `infracoes resumido` ou `--canvas-infracoes resumido|ambos`
- Sidecar simples: `cobranca-simples-{tipo|placa}-{data}.json`
- Gerador: `node scripts/gen-cobranca-canvas.mjs` — detecta `tipo` no JSON (`cobranca`, `cobranca-simples`, `relatorio-infracoes`, `relatorio-infracoes-resumido`)
- Cópia automática para `~/.cursor/projects/d-Dropbox-Aworklanza/canvases/`

Implementação: `resolverModoCanvasCobranca()` · `montarCobrancaSimplesSidecar()` em `cobrancasRelatorioSidecar.ts`.

### Layout completo (`cobranca.layout.tsx`)

Cada relatório tem **o seu próprio layout** em `templates/canvas/`:

| Relatório | Layout | Gerador |
|---|---|---|
| Encerramento | `encerramento.layout.tsx` | `node scripts/gen-encerramento-canvas.mjs …` |
| Cobrança (completo) | `cobranca.layout.tsx` | `node scripts/gen-cobranca-canvas.mjs …` |
| Infrações (completo / resumido) | `relatorio-infracoes.layout.tsx` / `relatorio-infracoes-resumido.layout.tsx` | `node scripts/gen-cobranca-canvas.mjs …` |
| Cobrança (filtro tipo/placa) | `cobranca-simples.layout.tsx` | `node scripts/gen-cobranca-canvas.mjs …` |

O layout de **cobrança** foi **copiado** do de encerramento (tabelas, cartão, stats, divisor). Depois da cópia, **evoluem em paralelo** — alterar um **não** altera o outro.

Detalhes: `templates/canvas/README.md`.

**Todas as despesas em aberto** do escopo entram no relatório (`cliente-despesas.json`, `paga !== true`, ativas). Exclui **quebra de contrato** e **CRÉDITO** (devolução).

**Adaptações do layout de cobrança** (face ao encerramento):

| Secção encerramento | Cobranças |
|---|---|
| **Encerramento de contrato** | **Relatório de cobranças** |
| Vigência + encerramento | `{dataInicio} → {dataFim} ({qtdDiasContrato} dias de contrato) · Gerado em {dataAtual} ({qtdDiasLocado} dias de locação)` |
| Cartão **Saldo caução** | Cartão **Total a cobrar** (`totalDebitos`, cor laranja) |
| Stats: semanal · caução · retenção | Stats: **Locação semanal** · **Diária atraso** (2 colunas) |
| Infrações / Manutenção / Parcelas / Outros | Igual — infrações usam **`titulo`** |
| Créditos a devolver | **Omitir** |
| Callout quebra de contrato | **Omitir** |
| Totais débitos · créditos · Saldo | Apenas **Total a cobrar** |
| Avisos (operador) | Igual |
| — | **Pagamento semanal em atraso** — resumo + **uma tabela por semana** (`pagamentoSemanal.tabelas`) + total geral |
| — | **Mensagens WhatsApp** (`mensagensWhatsApp[]`) — **última secção** antes do divisor de totais (pagamento semanal + despesas em aberto; sem card duplicado de manutenção quando a unificada existe) |

### Arquivos

- **Sidecar JSON:** `relatorios/_tmp/cobrancas/cobranca-{placa}-{cliente}-{DD-MM-AAAA}.json`
- **Canvas (repo):** `canvases/cobranca-{placa}-{cliente}.canvas.tsx`
- **Canvas (Cursor IDE):** `~/.cursor/projects/d-Dropbox-Aworklanza/canvases/cobranca-{placa}-{cliente}.canvas.tsx` — **cópia obrigatória**; só o IDE abre daqui
- **Layout:** `templates/canvas/cobranca.layout.tsx` (cópia independente do encerramento)
- Gerador: `node scripts/gen-cobranca-canvas.mjs relatorios/_tmp/cobrancas/cobranca-….json canvases/cobranca-….canvas.tsx` — grava no repo **e copia** automaticamente para o diretório do Cursor
- Dados embutidos inline; importe **só** de `cursor/canvas`; cores via `useHostTheme()`
- Sem slop; link markdown para o `.canvas.tsx` **no diretório do Cursor** ao terminar

Detalhes dos campos JSON: `reference.md` nesta pasta.

**Saudação com nome:** os textos usam "Olá, {NOME}!". O nome (primeiro nome) é resolvido automaticamente — multa pelo `condutorId` da despesa (ou inferido pela data via contrato); semanal/estacionamento/pedágio pelo **contrato ativo hoje** da placa. Sem contrato/condutor, vira "Olá!". Use `--nome` para forçar.

- **multa / infracoes:** gera **uma mensagem por infração em aberto** da placa (categoria `Infração`, não paga, não quitada no DETRAN). Ignora lançamentos espelhados do Rastreame (`origem: rastreame` / auto `RAST-…`). Use `--auto` para uma multa específica (modo por placa).
- **renegociacao / manutencao:** valor total = soma de `valorMulta` das despesas em aberto da placa.
- **estacionamento / pedagio:** valor/pontos no texto são **fixos** (aviso do CTB), não vêm do banco — só precisam da placa.

## Ao perguntar o veículo

Sempre que questionar/listar um veículo, informar **placa + marca/modelo + ano** (de `veiculos.json`) — nunca só a placa.

## Antes de cobrar

- **multa:** rodar **sync-infracoes** antes para garantir multas atualizadas em `cliente-despesas.json`.
- Conferir marca/modelo/cor da placa em `veiculos.json` (preenche `{MARCA_MODELO}` / `{MODELO_COR}`).
- Os dados de pagamento (PIX/lotérica) são **fixos** nos templates `semanal-*`; editar lá se mudarem.

## Editar/adicionar modelos

Cada arquivo em `templates/cobrancas/` é o texto literal enviado (com formatação WhatsApp: `*negrito*`). Campos disponíveis:
`{PLACA}`, `{NOME}`, `{MARCA_MODELO}`, `{MODELO_COR}`, `{DESCRICAO}`, `{DATA}`, `{HORA}`, `{LOCAL}`, `{VALOR}`, `{LISTA}` (despesas em aberto).
Para mudar o texto de uma cobrança, edite o `.txt` — não é preciso mexer no código. A saudação "Olá, {NOME}!" colapsa para "Olá!" quando não há nome.

Todas as mensagens recebem automaticamente um **rodapé em itálico** indicando envio automático pelo sistema "Gerenciador de Locações Veiculares" (constante `RODAPE_AUTOMATICO` em `src/lib/cobrancas.ts` — alterar lá).

## Skills relacionadas

- **sync-infracoes** — atualiza multas em `cliente-despesas.json`.
- **cadastro-recebimento** — pagamento semanal (Rastreame Gastos Gerais).
