# IPVA / Licenciamento — referência técnica

## Fonte de dados

Mesma API de **sync-infracoes**:

- Base: `https://backend.detran.sc.gov.br/transito-api`
- Consulta: POST `/veiculo/consulta` → GET `/veiculo/resposta-consulta?t=…`
- Campo usado: **`debitos[]`**

Ver também `sync-infracoes/reference.md` para auth e captura de token.

## Classificação de `debitos`

| Texto / campo | Categoria | Ação |
|---------------|-----------|------|
| contém `ipva` (sem ser multa) | `IPVA` | gravar em `parceiro-despesas.json` |
| contém `licenciamento` | `Licenciamento` | gravar em `parceiro-despesas.json` |
| `numeroAuto` ou multa/infração | — | ignorar (**sync-infracoes**) |
| DPVAT, taxa DETRAN, CRLV, etc. | — | ignorar |

## Exemplo de débito

```json
{
  "classe": "Licenciamento Anual 2026",
  "numeroDetranNET": "12345678",
  "vencimento": "30/12/2026",
  "valorAtual": 149.37,
  "exercicio": 2026
}
```

→ `categoria: Licenciamento`, `data: 30/12/2026`, `valor: 149.37`, `origem: detran-sc/debitos/MKV6268/Licenciamento/12345678`

## Módulos

| Ficheiro | Função |
|----------|--------|
| `src/lib/detranSc/mapDebitosProprietario.ts` | Filtra IPVA/Licenciamento |
| `src/lib/detranSc/syncDespesasVeiculo.ts` | Orquestra consulta + gravação |
| `src/lib/parceiroDespesasDb.ts` | `sincronizarParceiroDespesa()` — dedupe por `origem` |
| `src/cli/syncIpvaLicenciamento.ts` | CLI |
| `src/cli/gravarDespesa.ts` | Entrada manual (**cadastrar-despesa**) |

## Batch alternativo (cadastrar-despesa)

Montar JSON e gravar item a item com `gravar-despesa`, ou usar a sync automática (recomendado para frota).

```json
[
  {
    "placa": "MKV-6268",
    "categoria": "IPVA",
    "descricao": "IPVA 2026",
    "data": "15/03/2026",
    "valor": 850.0,
    "competencia": "03/2026",
    "origem": "detran-sc/debitos/MKV6268/IPVA/2026"
  }
]
```

A sync CLI grava diretamente via `parceiroDespesasDb` com as mesmas regras.
