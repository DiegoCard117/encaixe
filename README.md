# Criador de Currículo (nome provisório)

Gera um currículo adaptado para cada vaga a partir de um **banco de fatos** seu — sem inventar nada.
A ferramenta só seleciona, reordena e reescreve fatos reais; cada frase gerada cita o `fact_id` de onde veio,
e uma checagem em código barra tecnologias e números que não estão nos fatos citados.

## Estrutura

```
packages/core   lógica pura (schema zod, aderência, geração, anti-invenção) — sem UI, disco ou rede
apps/web        interface principal, 100% no navegador (em breve)
apps/cli        casca fina sobre o core (depois da web)
```

## Desenvolvimento

Requer Node 20+ e pnpm (`corepack enable`).

```powershell
pnpm install
pnpm test
pnpm typecheck
```

## Licença

MIT. Se a ferramenta te ajudou, considere apoiar (links em breve).
