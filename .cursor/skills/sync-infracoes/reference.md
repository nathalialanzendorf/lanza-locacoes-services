# sync-infracoes — referência

Auth, endpoints e classificação de `debitos[]`: **`.cursor/tools/detran-sc/reference.md`**.

## Arquitetura (04/07/2026)

| Camada | Ficheiro | Responsabilidade |
|--------|----------|------------------|
| **Infração DETRAN** | `database/infracoes.json` | Payload completo do portal, condutor, PDF, status, `detranRaw` |
| **Débito cobrável** | `database/cliente-despesas.json` | Cobrança, Rastreame (Gastos Gerais), encerramento de contrato |

**Vínculo:** `numeroAuto` (case-insensitive) em ambos; `infracoes.clienteDespesaId` → uuid do débito espelhado.

Módulos:

| Ficheiro | Função |
|----------|--------|
| `src/lib/infracoesDb.ts` | CRUD `infracoes.json`, `sincronizarInfracao`, vínculo débito |
| `src/lib/detranSc/syncVeiculo.ts` | Orquestra sync: infracoes → cliente-despesas → PDF |
| `src/lib/detranSc/mapInfracoes.ts` | Normalização e mescla autuação + débito |
| `src/lib/clienteDespesasDb.ts` | Espelho cobrável (`sincronizarClienteDespesa`) |

## Campos em infracoes.json

| Campo | Uso |
|-------|-----|
| `numeroAuto` | Chave natural (= DETRAN `numeroAuto`) |
| `idAutoInfracao` | ID numérico DETRAN |
| `veiculoId` | Placa |
| `descricao` | Texto cru DETRAN |
| `dataAutuacao` | DD/MM/AAAA HH:mm — inferência de condutor |
| `dataHoraAutuacao` | ISO bruto DETRAN |
| `dataLimiteDefesa` | Prazo de defesa (autuação) |
| `dataVencimentoOriginal` | Vencimento boleto — juros/multa |
| `convertidaEmDebito` | Autuação virou débito |
| `statusInfracao` | Advertida \| Paga \| Notificada \| Justificada |
| `statusDetran` | advertida \| paga \| justificada |
| `condutorId` / `condutorContrato` | Vínculo locatário |
| `pdfArquivo` | PDF na pasta Débitos |
| `clienteDespesaId` | uuid em cliente-despesas.json |
| `detranRaw` | Payload bruto (campos extras) |

## Campos em cliente-despesas.json (espelho)

| Campo | Uso no encerramento / cobrança |
|-------|-------------------------------|
| `autoInfracao` | Chave única (= `numeroAuto` DETRAN) |
| `numeroAuto` | Vínculo com `infracoes.json`; entra no `titulo` |
| `veiculoId` | Placa |
| `condutorId` / `condutorContrato` | Filtrar multas do locatário |
| `dataAutuacao` | Período do contrato |
| `valorMulta` | Valor cobrável (atualizado pelo débito com juros) |
| `statusInfracao` | Advertida \| Paga \| Notificada \| Justificada (espelho DETRAN) |
| `statusDetran` | Semântica de cobrança: advertida \| paga \| justificada |
| `dataLimiteDefesa` | Prazo de defesa (bloco `infracoes`) |
| `dataVencimentoOriginal` | Vencimento do boleto — juros/multa após esta data |
| `convertidaEmDebito` | Infração virou débito (`debitos[]` ou defesa vencida) |
| `quitadaDetran` | Paga no DETRAN — não cobrar |
| `paga` | Locatário quitou com a Lanza |
| `condutorConfirmado` | `false` → revisar antes de cobrar |
| `pdfArquivo` | Caminho do PDF da notificação (pasta `Débitos`) |

## Ciclo autuação → débito

1. **Autuação** (`infracoes[]`): `statusInfracao: Notificada`, `dataLimiteDefesa` preenchida.
2. **Defesa vencida** ou boleto gerado: registro mesclado com `debitos[]` do mesmo `numeroAuto`.
3. **Débito**: `convertidaEmDebito: true`, `dataVencimentoOriginal` — após vencer, juros/multa DETRAN.
4. **Quitação**: `historicoInfracoes` ou `statusInfracao: Paga` → `quitadaDetran: true`.

Helpers em `src/lib/infracaoTitulo.ts`: `infracaoNaoCobravelDetran`, `infracaoConvertidaEmDebito`, `infracaoVencidaParaJuros`.

Módulo de mapeamento: `src/lib/detranSc/mapInfracoes.ts` (`mesclarMultaDetran`, `defesaVencida`).

## PDF da infração

Ver secção **PDF da infração** em [SKILL.md](SKILL.md). Módulos:

| Ficheiro | Função |
|----------|--------|
| `src/lib/detranSc/pdfInfracao.ts` | Download do PDF (API + payload embutido) |
| `src/lib/detranSc/indexRawInfracoes.ts` | Índice auto → objeto bruto DETRAN |
| `src/lib/infracaoPdfStorage.ts` | Resolução de pastas e gravação em `Débitos/` |

PDF gravado em **ambos** `infracoes.json` e `cliente-despesas.json`.

## Backfill

Migrar infrações históricas de `cliente-despesas.json` → `infracoes.json`:

```bash
npx tsx scripts/backfillInfracoesFromClienteDespesas.ts [--dry-run]
```

## Confirmar condutor

```bash
npx tsx src/run.ts gravar-cliente-despesa confirmar <autoInfracao>
```

## Relatório de lote

`relatorios/sync/_sync_infracoes.json` — resumo por placa (`infracoesNovos`, `infracoesAtualizados`, `novos`, `atualizados`, avisos).

## Não confundir com

- **sync-ipva-licenciamento** → `parceiro-despesas.json` (dono do veículo; sem `numeroAuto` no título).
- **cadastro-despesa** → lançamento manual (não substitui sync DETRAN).
