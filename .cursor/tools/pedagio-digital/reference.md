# Pedágio Digital — referência técnica

## Base URL

```
https://pedagiodigital.com/bff/api
```

Origin: `https://pedagiodigital.com` · Referer típico: `https://pedagiodigital.com/` (em `register`, `/add-veiculo`).

## Endpoints

| Operação | Método | Path | Estado |
|----------|--------|------|--------|
| Login (CPF+senha) | POST | `/bff/login` *(fora de `/bff/api`)* | **confirmado** |
| Cadastrar placa | POST | `/Placa/register` | **confirmado** |
| Excluir placa | POST | `/Placa/delete/{idUsuarioPlaca}` *(sem corpo)* | **confirmado (27/06/2026)** |
| Listar veículos | GET | `/Placa/list` *(fallbacks: `/Placa`, `/Placa/listar`, `/Veiculo`)* | **confirmado** |
| Passagens (todas as placas) | GET | `/Passagem/list-logado?placas=P1,P2,...` | **confirmado (27/06/2026)** |

> **Passagens numa só chamada:** `list-logado` recebe `placas` = lista de placas
> **compactas** (sem hífen), separadas por vírgula, e devolve as passagens de todas
> elas (cada item traz a sua placa). A tool faz **1 pedido para a frota inteira** —
> muito mais robusto, pois a sessão do BFF expira em poucos minutos.

> Os GET de `/bff/api` enviam **cookie + `x-csrf-token`** (não só nos POST).

> **TLS:** nesta máquina há interceção TLS (antivírus/proxy) → defina `PEDAGIO_DIGITAL_TLS_INSECURE=1` (igual a `RASTREAME_TLS_INSECURE`) se o Node falhar com `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

> **Akamai:** chamar `www.pedagiodigital.com` por `curl` é barrado pelo bot manager (HTTP 403 `edgesuite`). Use o host **sem `www`** (`pedagiodigital.com`), como a tool faz.

> **Sessão curta → use offline:** se a sessão expirar (HTTP 401 `unauthorized`),
> salve a resposta de `list-logado` (DevTools → Response → Save) e rode
> `sync-pedagios --json arquivo.json` (processa toda a frota, sem API).

### POST `/Placa/register` (confirmado)

Body mínimo (campos confirmados no portal):

```json
{ "placa": "IYR8F19", "modelo": "GOL 1.0", "cdStatus": true, "blPlacaInternacional": false }
```

**Comportamento confirmado (27/06/2026):** o `register` responde 200
`"Status da placa atualizado com sucesso."` e **só persiste `modelo`** (e `cdStatus`).
A entidade devolvida por `Placa/list` tem `marca`/`ano`/`cor`, mas o `register`
**não os grava** (voltam `null`) — o formulário `add-veiculo` também só envia `placa`+`modelo`.

➡️ Por isso a tool **concatena** as infos no único campo que persiste:
`modelo = "MODELO MARCA ANO COR"` (ex.: `"GOL 1.0 VOLKSWAGEN 2013 PRATA"`), a partir de
`modelo`/`marca`/`ano`(ou 1ª parte de `anoModelo`)/`cor` do `veiculos.json`.

```json
{ "placa": "AVU6740", "modelo": "GOL 1.0 VOLKSWAGEN 2013 PRATA", "cdStatus": true, "blPlacaInternacional": false }
```

- A tool ainda envia `marca`/`ano`/`cor` à parte (ignorados hoje; future-proof se o BFF passar a aceitar).
- Overrides na CLI: `register --placa P [--modelo M] [--marca M] [--ano A] [--cor C]` (com `--modelo`, usa o texto informado, sem compor).

### POST `/Placa/delete/{idUsuarioPlaca}` (confirmado 27/06/2026)

Exclui a placa da conta. **`POST` sem corpo** (`content-length: 0`); o `id` é o
`idUsuarioPlaca` que vem em `Placa/list` (a tool resolve placa → id sozinha).

➡️ **Regra:** ao **inativar** um veículo no `database/veiculos.json` (`ativo: false`),
excluí-lo do Pedágio — não cobramos pedágio de veículo fora de locação.

- CLI: `pedagio-digital delete --placa PLACA [--dry-run]`.
- Idempotente: se a placa não estiver no portal, não faz nada (sai OK).

## Headers

`accept: application/json`, `content-type: application/json`, `origin`, `referer`, `user-agent`, `cookie` (= `PEDAGIO_DIGITAL_COOKIE`), `x-csrf-token` (= `PEDAGIO_DIGITAL_CSRF`).

## Campos de passagem (parsing resiliente)

O normalizador procura, por ordem, vários nomes possíveis:

| Campo lógico | Chaves tentadas |
|--------------|-----------------|
| id (chave natural) | `id`, `idPassagem`, `idTransacao`, `nrTransacao`, `codigo`, `protocolo`, `uuid` |
| placa | `placa`, `nrPlaca`, `plate` |
| data/hora | `dataHora`, `dataHoraPassagem`, `dtPassagem`, `data`, `dtTransacao`, `dataTransacao` |
| valor | `valor`, `vlPassagem`, `vlPedagio`, `valorPedagio`, `total`, `vlTotal` |
| praça | `praca`, `pracaPedagio`, `dsPraca`, `nomePraca`, `concessionaria` |
| status | `status`, `situacao`, `dsStatus`, `statusPagamento`, `stPagamento` (+ flags `pago`/`blPago`/…) |

Em aberto = status com `aberto|pendente|devedor|não pago|atrasado` (ou flag `pago=false`). A chave natural do débito em `cliente-despesas.json` é **`PED-<id>`**.

## Login por CPF + senha (`POST /bff/login`)

Body confirmado:

```json
{ "cpfCnpj": "07073669500", "senha": "***", "tokenCaptcha": "<reCAPTCHA>", "tokenConcessao": "44", "idUsuario": null }
```

- `cpfCnpj` só dígitos (a tool remove pontuação de `PEDAGIO_DIGITAL_LOGIN`).
- **Sem** header `x-csrf-token` no login; envia só `Origin`/`Referer`/`User-Agent`.
- A resposta traz `Set-Cookie` com a sessão (`bff_sid`, `bff-csrf`, `XSRF-TOKEN`) → vira o `cookie`/`csrf` usados nas chamadas `/bff/api`.

⚠️ **`tokenCaptcha` é reCAPTCHA** (gerado no browser, ~2 min). Não automatizável de forma desatendida: passe um token fresco em `PEDAGIO_DIGITAL_CAPTCHA` ou use o override de sessão abaixo (recomendado para uso recorrente).

## Override / debug (capturar sessão no DevTools)

1. [pedagiodigital.com](https://pedagiodigital.com) logado.
2. DevTools → Network → qualquer pedido `/bff/api/...`.
3. Copiar o header **`cookie`** inteiro → `PEDAGIO_DIGITAL_COOKIE`.
4. Num pedido **POST** (ex.: `register`), copiar **`x-csrf-token`** → `PEDAGIO_DIGITAL_CSRF`.

Estes têm prioridade sobre o login por credenciais.

**Offline (recomendado quando a sessão expira):** salve a resposta de
`/Passagem/list-logado` (DevTools → Response → Save as) e processe sem API:
- `sync-pedagios --json arquivo.json` → toda a frota ativa (agrupa por placa).
- `sync-pedagios --json arquivo.json --placa PLACA` → só uma placa.
