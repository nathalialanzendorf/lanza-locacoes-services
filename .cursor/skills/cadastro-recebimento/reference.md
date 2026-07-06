# Rastreame API — Gastos (referência técnica)

Autenticação e execução CLI no site: tool `.cursor/tools/rastreame/`.

Documentação auxiliar para a skill **cadastro-recebimento**. Os exemplos usam **IDs fictícios**; substituir por valores reais obtidos na UI ou em respostas da API. **Não** versionar tokens.

## Confirmação antes de gravar

Regra de negócio na skill (`SKILL.md`, secção **Confirmação obrigatória**):

1. Montar tabela com **todos** os registos a criar/atualizar (colunas: Rastreável | Data | Descrição | Motorista | Tipo | Total).
2. Pedir **Sim/Não por linha** (seletor, um registo de cada vez).
3. **Só após Sim em cada linha do lote:** `gravar-cliente-despesa` → database; depois push Rastreame.

Não executar CLI de gravação nem `POST`/`PUT` na API antes da confirmação.

## Descrição — parcelas de caução

Sufixo **`{parcelaAtual}x{totalParcelas}`** (total de parcelas, **não** dia do mês):

- Em aberto: `ATRASADO Pagamento caução - 1x7`
- Quitada: `Pagamento caução - 1x7`
- Entrada na retirada: `Pagamento caução` (sem sufixo)
- **1.ª parcela (`1xN`):** vencimento na **semana seguinte** à retirada (não no mesmo dia da 1.ª semanal)

Ver secção **Formato das descrições — caução** em `SKILL.md`. Helper: `src/lib/caucaoParcelas.ts`.

## CLI `baixa-recebimento` (plano de baixa)

Monta o plano **sem gravar** — o agente usa a saída JSON para a tabela de confirmação:

```powershell
# Unitário
npx tsx src/run.ts baixa-recebimento plano --cliente Virginia --valor 650 --data 18/06/2026 --hora 06:10 --json

# Lote PagBank
npx tsx src/run.ts pagbank match --inicio 2026-05-31 --fim 2026-06-29 --json
```

Cada linha em `plano.linhas[]` vira uma pergunta Sim/Não. Campo `patch` vai para `gravar-cliente-despesa editar`.

### Campo `comprovante` (Rastreame)

Não existe em `cliente-despesas.json`. Após push, se `comprovanteRastreame` estiver preenchido:

1. `fetchGastoById(rastreameId)`
2. `PUT` com `{ ...gasto, comprovante: "texto" }`

Ver tool `.cursor/tools/pagbank/` para auth do modo lote.

## Endpoints

| Ação | Método | URL |
|------|--------|-----|
| Criar | `POST` | `https://rastreame.com.br/keek/rest/gasto/` |
| Atualizar | `PUT` | `https://rastreame.com.br/keek/rest/gasto/{id}` |

## POST (novo gasto) — corpo mínimo típico

Campos comuns observados no site:

```json
{
  "total": 775,
  "info": "Pagamento semanal - Sexta 19",
  "tipo": { "key": "OUTROS" },
  "rastreavel": { "key": "105" },
  "motorista": { "key": "31" },
  "data": "2026-06-21T01:37:00.000Z"
}
```

- Ajustar `data` ao instante real do pagamento (parcial quitado ou integral).
- `info` **sem** `ATRASADO` quando for o registo do valor efetivamente pago.

## PUT (atualizar gasto existente) — corpo espelhando o registo

O site costuma enviar o objeto completo do gasto, incluindo `id`, `ativo`, `dataCriacao`, `lockKey`, objetos `rastreavel` / `motorista` / `tipo` com `value` e `ativo`, etc.

Campos frequentemente alterados no fluxo desta skill:

- `total` — valor remanescente (parcial) ou valor original (só ajuste de texto/data no integral).
- `data` — data/hora do vencimento ou do pagamento conforme o caso.
- `info` — título/descrição; remover `ATRASADO` quando o pagamento for registado como quitado no sentido operacional.

> Tags `ATRASADO` / `[NEGOCIADO X]`: regra na **`SKILL.md`** desta pasta (seção "Tags no `info` — fonte única") e em **`renegociar-debitos`** para `[NEGOCIADO X]`.

Exemplo ilustrativo (dados inventados):

```json
{
  "id": 582,
  "data": "2026-06-20T02:59:00.000Z",
  "rastreavel": {
    "key": "105",
    "value": "BBV-6A91 - BBV6A91 - GOL 2018 (Maicon)",
    "ativo": true
  },
  "motorista": {
    "key": "31",
    "value": "Susana da Silva",
    "ativo": true
  },
  "fornecedor": null,
  "total": 25,
  "comprovante": null,
  "info": "ATRASADO - Pagamento semanal - Sexta 19",
  "tipo": { "key": "OUTROS", "value": "Outros", "ativo": true },
  "anexos": [],
  "dataCriacao": "2026-06-15T14:08:37.000Z",
  "ativo": true,
  "lockKey": 0
}
```

Antes do `PUT`, o agente deve **ler** o estado atual do gasto (mesmo objeto que a UI usa) e só alterar os campos necessários, para não anular campos obrigatórios do backend.

## Listagem via API

Se for necessário listar gastos por API (em vez de só pela UI), inspecionar no DevTools o pedido XHR quando se abre [Gastos — listagem](https://rastreame.com.br/#/gastos/list) e reutilizar a mesma URL, query string e headers (incl. `x-r2f-auth`). Usar essa listagem para **procurar `info` duplicado** antes de cada `POST` (ver skill **cadastro-recebimento** / `SKILL.md`).

## Duplicados

O Rastreame não impõe unicidade de `info` no cliente; a verificação é **processo obrigatório** do operador/agente para evitar lançamentos repetidos.
