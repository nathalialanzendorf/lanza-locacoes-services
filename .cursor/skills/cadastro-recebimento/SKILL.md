---
name: cadastro-recebimento
description: >-
  CRUD rental receipts on rastreame.com.br Gastos Gerais (OUTROS): weekly payments,
  settlements, invoices. Use for recebimento locação, pagamento semanal, gastos/list.
---

# Cadastro de recebimento (Rastreame — Gastos gerais)

Skill para **cadastrar, editar e excluir** recebimentos de locação no **Rastreame** (Gastos Gerais).

## Operações

| Operação | Como |
|----------|------|
| **Cadastrar** | `rastreame-gastos post` (após checar duplicado) |
| **Editar** | `rastreame-gastos put <id>` |
| **Excluir** | Via UI Rastreame ou API conforme `.cursor/tools/rastreame/` |

**Listagem (UI):** [Gastos — listagem](https://rastreame.com.br/#/gastos/list)

## Autenticação e execução no site

- **Nunca** colar tokens JWT, cookies ou `curl` com sessão no repositório.
- **Auth** (`RASTREAME_*`) e **comandos** no site: tool `.cursor/tools/rastreame/` (referência técnica).

## API (REST) — referência

- Base: `https://rastreame.com.br/keek/rest/gasto/`
- **Novo:** `POST` `https://rastreame.com.br/keek/rest/gasto/` com JSON no corpo.
- **Atualizar:** `PUT` `https://rastreame.com.br/keek/rest/gasto/{id}` com corpo que inclua `id` e campos a manter/atualizar (espelhar o que o site envia no Network).
- Headers mínimos (como no site): `Content-Type: application/json`, `x-r2f-auth: <token>`, `x-r2f-ns: null`, `Referer`/`Origin` em `https://rastreame.com.br/`.
- **`tipo`:** sempre **`OUTROS`** (`"tipo":{"key":"OUTROS","value":"Outros","ativo":true}` no PUT completo; no POST mínimo costuma bastar `"tipo":{"key":"OUTROS"}`).
- **`rastreavel`** e **`motorista`:** usar `key` (e `value` quando o PUT exigir espelho do registo) conforme capturado no DevTools ao editar um gasto existente na UI — os `key` são identificadores internos do Rastreame.
- **`data`:** ISO 8601 como o site envia (ex.: `2026-06-20T02:59:00.000Z`). Para **23:59** no fuso acordado (ex. Recife), calcular o instante correto em UTC ou **copiar o padrão** de um gasto de teste gravado na UI e reproduzir a mesma conversão.

Detalhe de campos e exemplos de corpo: ver `reference.md` nesta pasta.

## Antes de cadastrar — verificar duplicado (obrigatório)

**Sempre**, antes de **`POST`** (novo gasto), **confirmar que já não existe** um registo com o **mesmo nome** — isto é, o mesmo texto em **`info`** (título/descrição visível na [listagem](https://rastreame.com.br/#/gastos/list)), **no mesmo contexto** quando fizer sentido:

1. Consultar a listagem (filtros por data / motorista / rastreável conforme a UI) **ou** o endpoint de listagem capturado no DevTools.
2. Comparar **`info`** com normalização mínima: `trim`, espaços consecutivos, e **ignorar diferença só entre** `ATRASADO -` vs `ATRASADO ` se for claramente o mesmo lançamento (evitar duplicar parcela).
3. Restringir a duplicidade ao **mesmo `motorista.key`** e **mesmo `rastreavel.key`** quando estiveres a lançar para esse par (dois motoristas diferentes podem ter textos semelhantes).
4. **Se já existir** um gasto com esse **`info`** (e mesmo motorista/rastreável): **não** criar outro com `POST`; em vez disso, **editar o existente** (`PUT`) se for correção de valor/data, ou **abortar** e alinhar com o operador se for erro de dados.

Isto aplica-se a: lançamentos de **segunda** (`ATRASADO - Pagamento semanal - …`), **novo registo após pagamento parcial**, **fatura da semana**, e qualquer outro `POST` ao abrigo desta skill.

## Segunda-feira — lançamentos automáticos (em atraso)

**Objetivo:** cada **segunda**, cadastrar no Rastreame os valores **a receber** naquela semana, por **cliente (motorista)** e **veículo (rastreável)**, de acordo com **contrato** e veículo (consultar pasta do contrato / `database/clientes.json` / `database/veiculos.json` e valores semanais acordados).

Para cada combinação a lançar:

| Campo | Regra |
|-------|--------|
| **Tipo** | **Outros** (`OUTROS`). |
| **Horário** | Sempre **23:59** (no fuso usado pelo operador; ver nota acima sobre `data` em ISO). |
| **Título / `info`** | Exatamente: **`ATRASADO - Pagamento semanal - {dia_semana} {dia}`** — onde `{dia_semana}` é o dia da semana em português (ex.: Segunda, Terça, …) e `{dia}` é o dia do mês (ex.: 22). **Exemplo:** `ATRASADO - Pagamento semanal - Segunda 22` |
| **`total`** | Valor da parcela semanal prevista (contrato + veículo). |

**Automatização:** agendar na máquina do operador (ex.: **Agendador de Tarefas** do Windows) um comando à segunda que invoque o agente com esta skill **ou** scripts que chamem os comandos da tool Rastreame (`rastreame-gastos post`, etc.) com JSON gerado (sempre após verificação de duplicados).

## Quando o cliente paga — edição e novos registos

### Pagamento integral (valor pago = valor total devido)

1. **Editar** o gasto existente (o que tinha `ATRASADO` no título):
   - Remover a palavra **`ATRASADO`** do texto em **`info`** (manter o restante coerente, ex. `Pagamento semanal - Sexta 19`).
   - Atualizar **`data`** (e horário) para a **data e hora reais do pagamento**.

### Pagamento parcial (valor pago < valor total)

1. **Atualizar (PUT)** o registo existente:
   - **`total`** = **saldo em atraso** (ex.: total devido R$ 800 − pago R$ 775 ⇒ **`total` 25**).
   - Manter o contexto de atraso no **`info`** conforme o caso (ex.: continuar a indicar que é o remanescente em atraso, alinhado ao texto que o site já usava para esse lançamento).
2. **Criar (POST)** um **novo** gasto (após **verificar duplicado** na secção acima — o `info` do pagamento parcial não deve já existir para esse motorista/rastreável):
   - **`total`** = **valor pago** (ex.: 775).
   - **`info`** = mesmo tipo de descrição **sem** a palavra **`ATRASADO`** (ex.: `Pagamento semanal - Sexta 19`).
   - **`data`** = **data e hora reais** do pagamento (ex.: 20/06 às 22:37 ⇒ refletir em ISO como no Network).

**Exemplo (resumo):** Susana; total devido **R$ 800** referente ao dia **19**; em **20/06 às 22:37** pagou **R$ 775** ⇒ atualizar o lançamento antigo para **R$ 25,00** em atraso; criar novo lançamento de **R$ 775** com data/hora do pagamento e **sem** `ATRASADO` no título.

## Fatura da semana

- Cadastrar também os lançamentos de **fatura da semana** conforme processo interno Lanza (valores, motorista, rastreável, datas), sempre respeitando **OUTROS** quando for o tipo acordado para estes movimentos.
- Cruzar com contrato/veículo para não duplicar parcela já quitada.
- **Antes do `POST`:** verificar na listagem se já não existe gasto com o **mesmo `info`** (nome) para o mesmo motorista/rastreável.

## Ordem sugerida para o agente

1. Confirmar autenticação (`.cursor/tools/rastreame/`).
2. Identificar motorista (`motorista.key`) e veículo (`rastreavel.key`) via UI ou `rastreame-gastos list` (tool Rastreame). Código de referência: `src/lib/rastreame/motorista.ts`, `src/lib/rastreame/gasto.ts`.
3. **Antes de qualquer `POST`:** verificar duplicado por **`info`** + motorista + rastreável (secção **Antes de cadastrar**).
4. Para rotina de segunda: listar quem deve parcela → só então **`rastreame-gastos post`** (tool Rastreame) com título **`ATRASADO - Pagamento semanal - …`** e `total` / `data` 23:59 (se já existir o mesmo `info` para o par, não duplicar).
5. Para quitação: localizar gasto na [listagem](https://rastreame.com.br/#/gastos/list) → aplicar regra integral vs parcial: **`rastreame-gastos put`** e, se parcial, **`rastreame-gastos post`** (tool Rastreame), com verificação de duplicado antes do `post`.

## Dependências

- Tool **Rastreame** (`.cursor/tools/rastreame/`) — execução dos comandos no site.
- Rede e browser/DevTools para validar payloads se a API mudar.
- Dados locais: `database/clientes.json`, `database/veiculos.json`, pastas de contrato em `contratosDir` (`config/lanza_paths.json`).
