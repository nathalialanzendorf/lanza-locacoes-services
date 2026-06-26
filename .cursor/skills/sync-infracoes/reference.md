# DETRAN SC — referência técnica

## Base URL

```
https://backend.detran.sc.gov.br/transito-api
```

Origin / Referer: `https://servicos.detran.sc.gov.br/`

## Endpoints

| Etapa | Método | Path | Notas |
|-------|--------|------|-------|
| Iniciar consulta | POST | `/veiculo/consulta` | Body `{ "placa": "ABC1D23", "renavam": "12345678901" }` |
| Alternativa | POST | `/veiculo/solicitar-consulta` | Mesmo body se o primeiro falhar |
| Resposta | GET | `/veiculo/resposta-consulta?t={uuid}` | Poll até payload completo |

Headers obrigatórios (ver skill principal):

- `Authorization: Bearer …`
- `X-Empresa`
- `X-App-Version`

Implementação: `src/lib/detranSc/consulta.ts`, `auth.ts`.

## Estrutura esperada (JSON)

```json
{
  "placa": "QJB0I83",
  "renavam": "01234567890",
  "infracoes": [
    {
      "numeroAuto": "P0cc2001pu",
      "descricao": "ESTAC EM LOCAL/HORÁRIO PROIBIDO…",
      "localComplemento": "RUA … - FLORIANOPOLIS/SC",
      "data": "16/04/2026",
      "hora": "13:58",
      "valor": 130.16,
      "situacao": "AUTUAÇÃO NOTIFICADA",
      "limiteDefesa": "22/06/2026"
    }
  ],
  "historicoInfracoes": [],
  "debitos": [
    {
      "classe": "Licenciamento Anual 2026",
      "valorAtual": 149.37,
      "vencimento": "30/12/2026"
    },
    {
      "classe": "Multa — auto P0dxg00170",
      "numeroAuto": "P0dxg00170",
      "valorAtual": 195.23,
      "vencimento": "15/08/2026"
    }
  ]
}
```

Nomes de campo variam (`numeroAuto` / `numAuto`, `localComplemento` / `localDataHoraMulta`). O mapper em `src/lib/detranSc/mapInfracoes.ts` aceita variantes.

## Classificação de `debitos`

**Ignorar (parceiro/dono):** licenciamento, IPVA, DPVAT, seguro obrigatório, taxa DETRAN, CRLV, recadastro, transferência, dívida ativa (sem vínculo com auto de infração).

**Importar (locatário):** item com `numeroAuto` ou texto contendo multa/infração/penalidade/autuação.

## Módulos

| Ficheiro | Função |
|----------|--------|
| `src/lib/detranSc/auth.ts` | Env + headers |
| `src/lib/detranSc/consulta.ts` | POST consulta + poll resposta |
| `src/lib/detranSc/mapInfracoes.ts` | Regras infracoes/debitos/historico |
| `src/lib/detranSc/syncVeiculo.ts` | Orquestra veículo/frota |
| `src/lib/clienteDespesasDb.ts` | `sincronizarClienteDespesa()` upsert |
| `src/cli/syncInfracoes.ts` | CLI |

## Capturar token no Chrome

1. Abrir [servicos.detran.sc.gov.br](https://servicos.detran.sc.gov.br/) logado (conta habilitação/veículos).
2. F12 → Network → filtrar `transito-api`.
3. Consultar um veículo.
4. Copiar `Authorization` (só o JWT, sem `Bearer`) → `DETRAN_SC_AUTH`.
5. Copiar `X-Empresa` → `DETRAN_SC_EMPRESA`.
6. Opcional: copiar `X-App-Version`.

Para debug offline: guardar corpo JSON de `resposta-consulta` e usar `--json`.
