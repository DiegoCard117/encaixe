# Encaixe

Seu currículo, encaixado na vaga. Sem inventar nada.

O Encaixe gera um currículo adaptado para cada vaga a partir de um **banco de fatos** seu.
A ferramenta só seleciona, reordena e reescreve fatos reais: cada frase gerada cita o `fact_id` de onde veio,
e uma checagem em código barra tecnologias e números que não estão nos fatos citados.

Roda 100% no navegador, sem conta e sem servidor. A LLM é chamada com a sua própria chave; banco de dados remoto é opcional.

## Status

Em desenvolvimento. Acompanhe o [roadmap](https://github.com/users/DiegoCard117/projects/2).

- [x] Schema do banco de fatos e do rascunho gerado
- [x] Checador anti-invenção
- [x] Playground do checador no navegador
- [x] Tema claro/escuro e interface em português e inglês
- [ ] Aderência fato × vaga, geração com LLM, editor do banco de fatos, exportação em PDF

## Estrutura

```
packages/core   lógica pura: schema zod, checador anti-invenção (aderência e geração a caminho) — sem UI, disco ou rede
apps/web        interface principal, React + Vite + Tailwind, 100% no navegador
apps/cli        casca fina sobre o core (depois da web)
docs/           decisões de arquitetura, produto, user flow e identidade visual
```

## Desenvolvimento

Requer Node 22+ e pnpm (`corepack enable`, ou `npm i -g pnpm` se o corepack pedir permissão de administrador).

```powershell
pnpm install
pnpm test
pnpm typecheck
pnpm format
pnpm --filter @encaixe/web dev   # abre o app em http://localhost:5173
```

O CI roda `format:check`, `typecheck` e `test` a cada push e pull request.

## Decisões

O que já foi decidido e por quê está em [docs/decisions.md](docs/decisions.md): princípio anti-invenção, arquitetura,
persistência, user flow do MVP, tema claro/escuro, i18n (pt-BR/en) e identidade visual.

## Licença

MIT. Se a ferramenta te ajudou, considere apoiar (links em breve).
