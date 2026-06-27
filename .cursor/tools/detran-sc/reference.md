# DETRAN SC — referência técnica

## Base URL

```
https://backend.detran.sc.gov.br/transito-api
```

Origin / Referer: `https://servicos.detran.sc.gov.br/`

## Endpoints

| Etapa | Método | Path |
|-------|--------|------|
| Iniciar consulta | POST | `/veiculo/consulta` — body `{ "placa", "renavam" }` |
| Alternativa | POST | `/veiculo/solicitar-consulta` |
| Resposta | GET | `/veiculo/resposta-consulta?t={uuid}` |

Headers: `Authorization`, `X-Empresa`, `X-App-Version` (ver [README.md](README.md)).

## Classificação `debitos[]`

| Texto | sync-infracoes | sync-ipva-licenciamento |
|-------|----------------|-------------------------|
| multa / `numeroAuto` | ✅ | ❌ |
| IPVA | ❌ | ✅ |
| Licenciamento | ❌ | ✅ |
| DPVAT, taxa DETRAN, CRLV | ❌ | ❌ |

## Módulos

| Ficheiro | Função |
|----------|--------|
| `src/lib/detranSc/auth.ts` | Env + headers |
| `src/lib/detranSc/consulta.ts` | POST + poll |
| `src/lib/detranSc/mapInfracoes.ts` | Infrações |
| `src/lib/detranSc/mapDebitosProprietario.ts` | IPVA/licenciamento |
| `src/lib/detranSc/syncVeiculo.ts` | Orquestra infrações |
| `src/lib/detranSc/syncDespesasVeiculo.ts` | Orquestra parceiro |
| `src/cli/syncInfracoes.ts` | CLI infrações |
| `src/cli/syncIpvaLicenciamento.ts` | CLI IPVA/licenciamento |

## Capturar token

1. [servicos.detran.sc.gov.br](https://servicos.detran.sc.gov.br/) logado.
2. DevTools → Network → `transito-api`.
3. Consultar veículo → copiar `Authorization` (JWT) e `X-Empresa`.

Debug offline: `--json relatorios/_tmp/_detran_resposta.json`.
