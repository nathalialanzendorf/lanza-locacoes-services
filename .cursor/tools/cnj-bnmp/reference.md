# Referência técnica — CNJ BNMP

Base: `https://portalbnmp.cnj.jus.br`

## Autenticação / sessão

- Consulta pública **anônima** após resolver o **captcha** do portal.
- Após o captcha, o portal grava um cookie de sessão **`portalbnmp`** (JWT de
  convidado, `ROLE_ANONYMOUS`) e envia um header **`fingerprint`** nas chamadas
  da API. A sessão expira em minutos e o captcha pode reaparecer.
- **Na triagem não copiamos cookie:** o `fetch` é feito **na própria página**
  (Chrome real), então o cookie/fingerprint da sessão vão automaticamente.

## Endpoints (consulta pública)

| Método | Path | Uso |
|--------|------|-----|
| POST | `/bnmpportal/api/pesquisa-pecas/filter?page=0&size=N&sort=` | Busca paginada de peças (por nome, nº de peça, nº de processo, UF/órgão). |
| POST | `/bnmpportal/api/pesquisa-pecas/pecas` | Lista de peças por órgão/UF (paginada por `pagina`/`tamanhoPagina`). |
| GET  | `/bnmpportal/api/pesquisa-pecas/orgaos/unidade-federativa/{ufId}` | Órgãos por UF. |

### Headers (quando chamado fora do browser — referência)

```
Accept: application/json, text/plain, */*
Content-Type: application/json;charset=UTF-8     (sem isto → HTTP 415 nos POST)
Origin: https://portalbnmp.cnj.jus.br
Referer: https://portalbnmp.cnj.jus.br/
fingerprint: <gerado pelo portal>
Cookie: portalbnmp=<jwt de convidado>
```

### Payload da busca por nome (`/filter`)

O corpo varia conforme a versão do portal; os campos observados são um envelope
com o nome da pessoa e filtros de órgão. Exemplos de chaves vistas em
implementações públicas: `buscaOrgaoRecursivo`, `numeroPeca`, `numeroProcesso`,
`orgaoExpeditor`, `idEstado`, e o nome da pessoa (campo de texto).

> **Por isso a triagem não fixa o payload:** em vez de adivinhar o schema exato,
> o operador faz a busca por nome na UI e nós **capturamos a resposta** do
> `/filter` (ou `/pecas`) via CDP (`Network.getResponseBody`). É robusto a
> mudanças de schema e dispensa replicar o captcha/fingerprint no Node.

## Formato da resposta (envelope paginado)

Resposta típica do Spring (`Page`): objeto com `content[]` (as peças) +
`totalElements`, `totalPages`, `number`, `last`. Cada item costuma trazer
(nomes aproximados, achatados):

- `id` / `idPeca` — id da peça.
- nome da pessoa (`pessoa.nome`, `nome`).
- `numeroPeca`, `numeroProcesso`.
- `tipoPeca` (ex.: mandado de prisão).
- `dataExpedicao`.
- órgão expedidor, município, UF.
- tipificação penal / síntese da decisão.

O parser de `src/lib/analiseCadastro/bnmp.ts` faz **autodetecção** do array de itens
(`content`/`resultados`/`itens`/`dados`/`pecas`/`mandados`) e achata os campos
de pessoa, de forma tolerante a variações.

## Reconhecimento (como capturar manualmente)

1. Abrir `https://portalbnmp.cnj.jus.br/#/pesquisa-peca` e passar o captcha.
2. Aba **Network** (F12), filtrar por `filter` ou `pecas`.
3. Pesquisar pelo nome → inspecionar a requisição `filter?...`:
   - **Request Headers** → confirmar `Cookie: portalbnmp=...` e `fingerprint`.
   - **Payload** → ver os campos atuais do corpo.
   - **Response** → ver o envelope/`content[]`.

## Notas operacionais

- Limite do backend: ~2000 itens por POST; paginação limitada (~10k primeiros).
  Para triagem (busca nominal) isso é irrelevante — o volume é pequeno.
- Incidente de integridade reportado pelo CNJ (jan/2026): tratar o BNMP como
  **um** sinal, nunca como prova isolada.
