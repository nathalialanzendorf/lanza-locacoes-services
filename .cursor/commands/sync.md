# Sync completo

Siga a skill **sync**.

Dispara **todas** as skills de sync em **7 agentes paralelos** (Pedágio, DETRAN SC, DETRAN RS, motoristas, rastreáveis, gastos gerais, seguro).

## Uso

```
/sync
/sync Rastreame          → só agentes 4–6 (ver reference.md)
/sync DETRAN             → só agentes 2–3
```

## Fluxo

1. Lançar os 7 agentes numa única mensagem (`Task`, `run_in_background: true`).
2. Aguardar conclusão; consolidar resumo (template na skill).
3. Reportar tokens expirados, login gov.br ou captcha Pedágio — **sem** bloquear nos outros agentes.

Prompts: `.cursor/skills/sync/reference.md`
