# Como contribuir

## Antes de começar

Abra uma issue ou comente em uma existente para alinhar o problema e a mudança.

O princípio anti-invenção é inegociável. Todo texto gerado deve citar os fatos de origem em `sourceFactIds` e passar pelo checador. Empresa, cargo e datas vêm do banco, a partir dos ids devolvidos pela LLM. Lacunas não podem virar afirmações no currículo.

## Setup

Use Node 22+ e pnpm. Para disponibilizar o pnpm, use `corepack enable` ou `npm i -g pnpm`.

Na raiz do monorepo:

```powershell
pnpm install
pnpm --filter @encaixe/web dev
```

O app fica em http://localhost:5173. O playground do checador fica em http://localhost:5173/#/playground.

## Scripts e CI

| Comando                            | Para que serve                              |
| ---------------------------------- | ------------------------------------------- |
| `pnpm test`                        | Rodar os testes.                            |
| `pnpm typecheck`                   | Conferir os tipos.                          |
| `pnpm format`                      | Formatar os arquivos.                       |
| `pnpm format:check`                | Conferir a formatação sem alterar arquivos. |
| `pnpm --filter @encaixe/web build` | Gerar o build da aplicação web.             |

O CI roda `format:check`, `typecheck` e `test` nos pull requests e nos pushes na `main`. O workflow Pages publica a aplicação no GitHub Pages a cada push na `main`. Em um fork, configure a fonte do Pages como “GitHub Actions”.

## Estrutura e regras

| Caminho         | Responsabilidade                                                                      |
| --------------- | ------------------------------------------------------------------------------------- |
| `packages/core` | Schemas, checador, aderência, prompts, parsing e renderização dos dados do currículo. |
| `apps/web`      | Interface React + Vite + Tailwind e integrações no navegador.                         |
| `docs/`         | Decisões, fluxo do produto, identidade visual e exemplo do banco de fatos.            |

`apps/cli` é a CLI (`pnpm cli`), que roda o TypeScript direto com `tsx`. A lógica fica em `src/cli.ts`, testável sem processo; `src/main.ts` só liga ao terminal.

- Mantenha o core puro: sem UI, rede, disco ou DOM.
- O core devolve códigos, nunca frases para o usuário. A interface traduz os códigos.
- Todo texto de interface fica nos dicionários tipados de `apps/web/src/i18n.tsx`, em pt-BR e en.
- Use cores apenas por tokens, com valores para os temas claro e escuro.
- Faça o layout funcionar a 375px, sem rolagem lateral.
- Não adicione dependências sem explicar o motivo.
- Teste com Vitest a lógica do core e a lógica pura da web (ex.: `apps/web/src/sync/decide.ts`). Mantenha os testes junto do código, em arquivos `*.test.ts`.

## Testar a geração sem gastar

Com o Ollama rodando localmente e um modelo já disponível, abra **Configurar LLM**. Escolha o provedor **Compatível com OpenAI** e o atalho **Ollama**. Informe o nome do modelo local; a chave da API é opcional no Ollama.

Inicie o Ollama com `OLLAMA_ORIGINS` apontando para `http://localhost:5173` para permitir as chamadas do app local. Para usar o site publicado, o valor é `https://diegocard117.github.io`. Assim você testa a geração com um modelo local, sem pagar por chamadas a um provedor externo.

## Commits e documentação

Use Conventional Commits em português. Exemplos:

- `feat(web): adiciona filtro de fatos`
- `fix(core): corrige validação de contexto`
- `docs: explica a importação de currículo`
- `ci: ajusta a verificação de tipos`

Explique o porquê da mudança no corpo do commit. Inclua `Closes #N` quando ele fechar uma issue.

Atualize `README.md`, `README.en.md` e `docs/decisions.md` no mesmo commit que mudar estrutura, comandos ou decisões.

## Pull requests

Descreva brevemente o que mudou e por quê. Envie o PR com os checks passando. Para mudanças visuais, inclua prints nos temas claro e escuro e no celular.
