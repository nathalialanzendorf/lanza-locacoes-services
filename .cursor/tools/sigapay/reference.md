# SigaPay — referência técnica (Estacionamento ← SigaPay)

Integração com o portal/app **SigaPay** (Zona Azul Brasil) para sincronizar ACT/avisos de irregularidade em `cliente-despesas.json`, com inferência e confirmação manual de responsável (igual pedágios e infrações).

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `SIGAPAY_ORIGIN` | Origin (default `https://sigapay.com.br`) |
| `SIGAPAY_API_BASE` | Base da API (default `{ORIGIN}/api`) — **ajuste após capturar no DevTools** |
| `SIGAPAY_COOKIE` | Header `cookie` capturado no DevTools |
| `SIGAPAY_TOKEN` | Bearer ou token de sessão |
| `SIGAPAY_EXTRA_HEADERS` | JSON opcional com headers extras |
| `SIGAPAY_PATH_AVISOS` | Path listagem ACT (default `/Aviso/list-logado`) |
| `SIGAPAY_PATH_PLACAS` | Paths GET placas, separados por vírgula |
| `SIGAPAY_TLS_INSECURE` | `1` se interceção TLS local |

## Modo offline (recomendado até confirmar endpoints)

1. Logado no portal/app SigaPay, abra DevTools → Network.
2. Localize a resposta com ACT/avisos das placas da frota.
3. Salve o JSON (Save response).
4. Sync via API ou CLI:

```powershell
# Frota inteira
npm run sync -- estacionamento --json caminho\avisos.json

# Uma placa
npm run sync -- estacionamento --placa ABC1D23 --json caminho\avisos.json
```

## Chave natural do débito

- Prefixo: `EST-{id}`
- Categoria: `Estacionamento`
- Portal/app: SigaPay (Zona Azul Brasil)
- Origem: `sigapay`
- Legado aceito: categoria `Estacionamento`

## Campos do aviso (parsing resiliente)

| Campo lógico | Chaves tentadas |
|--------------|-----------------|
| id | `id`, `idAviso`, `idAct`, `numeroAct`, `protocolo`, … |
| placa | `placa`, `nrPlaca`, `plate`, … |
| data/hora | `dataHora`, `dtAviso`, `dataIrregularidade`, … |
| valor | `valor`, `vlAviso`, `valorRegularizacao`, … |
| local | `cidade`, `unidade`, `local`, `endereco`, … |

Em aberto = status com `aberto|pendente|irregular|act|aviso|atrasado` (ou flag `pago=false`).

## API Lanza

| Operação | Método | Path |
|----------|--------|------|
| Listar veículos portal | GET | `/api/estacionamento/veiculos` |
| Cadastrar placa | POST | `/api/estacionamento/veiculos` |
| Excluir placa | DELETE | `/api/estacionamento/veiculos/{placa}` |
| ACT/avisos por placa | GET | `/api/estacionamento/avisos?placa=&status=` |
| Conferir frota | GET/POST | `/api/estacionamento/conferir` |
| Sync → despesas | POST | `/api/sync/estacionamento` |
| Inferir responsável | POST | `/api/despesas/atribuir-clientes` `{ "escopo": "estacionamento" }` |

## Próximo passo

Capture os endpoints reais no DevTools (app ou sigapay.com.br) e atualize `SIGAPAY_API_BASE` + `SIGAPAY_PATH_*`. Enquanto isso, use `--json` offline.
