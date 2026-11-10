# Encaixe

Seu currículo, encaixado na vaga. Sem inventar nada.

[Use agora](https://diegocard117.github.io/encaixe/) · [English](README.en.md)

## O que é

O Encaixe adapta seu currículo a uma vaga usando um banco de fatos sobre sua trajetória.
Uma LLM seleciona, reordena e reescreve esses fatos.
O app confere as fontes do texto gerado e mostra violações para revisão.
Tudo roda no navegador, sem conta e com o provedor de LLM que você escolher.

## Como usar

1. **1 Banco de fatos:** escolha uma das três entradas. Em **Começar do zero**, preencha seu perfil e cadastre fatos reais. Em **Importar JSON**, carregue um banco salvo. Em **Importar currículo antigo**, cole o texto ou use **Abrir arquivo PDF ou TXT**. Configure o provedor em **Configurar LLM** e use **Extrair fatos**. Revise cada item e use **Confirmar** antes de adicioná-lo. O botão **Adicionar ao banco (N)** mostra a quantidade confirmada; itens pendentes ou descartados ficam de fora. Se o PDF não tiver texto selecionável, cole o texto. Para conhecer o fluxo, use **carregar exemplo**.
2. **2 Vaga e aderência:** cole a vaga em **Descrição da vaga**. Veja em **Aderência à vaga** as skills que batem, as **Lacunas** e os fatos mais relevantes. Uma lacuna só deve ser preenchida se você tiver um fato real para cadastrar. Configure sua LLM e use **Gerar currículo**.
3. **3 Revisão:** leia o currículo e confira as fontes e as violações. Edite ou remova os bullets com problemas, ou use **Gerar de novo**. **Exportar PDF** só fica disponível com zero violações. Na janela de impressão, escolha **Salvar como PDF**.

## Como o Encaixe evita invenção

O banco de fatos é a única fonte do currículo. A LLM devolve ids, e o app preenche empresa, cargo e datas com os dados cadastrados. Cada frase gerada cita suas fontes em `sourceFactIds`.

A checagem em código barra fatos desconhecidos ou arquivados, fatos no contexto errado, skills e números sem apoio nos fatos citados. Uma lacuna da vaga nunca vira texto do currículo. O PDF fica bloqueado até haver zero violações.

Por exemplo: o fato “reduzindo o tempo de análise em 40%” permite usar “40%” em um bullet que o cite. Trocar por “60%”, sem outra fonte que sustente esse valor, vira violação.

A checagem tem limites: números por extenso e tecnologias fora do banco não são detectados. Zero violações não garante que cada frase esteja correta. A revisão humana continua necessária.

## Banco de fatos

| Tipo                       | O que registrar                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Experiência (`experience`) | Empresa, cargo, período e contexto do trabalho.                                                    |
| Conquista (`achievement`)  | Algo que você fez ou alcançou em uma experiência, projeto ou formação, com métricas quando houver. |
| Projeto (`project`)        | Projeto pessoal, profissional, acadêmico ou de código aberto.                                      |
| Formação (`education`)     | Formação acadêmica, curso ou certificação.                                                         |
| Skill (`skill`)            | Habilidade ou tecnologia, com categoria e grafias alternativas.                                    |

Veja o [exemplo de banco de fatos em JSON](docs/exemplo-banco-de-fatos.json).

## Qual LLM usar

- **Anthropic** (Claude) ou **OpenAI**: pagos por uso; gerar um currículo custa centavos, dependendo do modelo e do tamanho dos textos.
- **Sem pagar**: Gemini, Groq ou OpenRouter têm camadas gratuitas. Confira os termos: planos gratuitos podem usar seus dados.
- **Local**: rode um modelo no seu PC com o **Ollama**. Com o provedor local, nada é enviado a um serviço externo. Em **Configurar LLM**, escolha **Compatível com OpenAI** e o atalho **Ollama**. Para o Ollama aceitar o app, inicie-o com `OLLAMA_ORIGINS` apontando para o endereço do app. No site publicado, use `https://diegocard117.github.io`.

## Privacidade

O banco de fatos fica no navegador, em `localStorage`. Não há conta, servidor do projeto ou telemetria. Por padrão, a chave da API fica só na aba aberta. A opção **Lembrar neste navegador** permite salvá-la neste navegador.

O texto da vaga, o texto do currículo antigo e os fatos usados nas chamadas vão diretamente ao provedor de LLM escolhido. Confira os termos desse provedor antes de enviar seus dados. Com Ollama local, o destino é sua própria máquina.

Use **Exportar JSON** para manter um backup do banco de fatos. O armazenamento do navegador não substitui uma cópia sua.

## Status

Em desenvolvimento. Acompanhe o [roadmap](https://github.com/users/DiegoCard117/projects/2).

- [x] Schema do banco de fatos e do rascunho gerado
- [x] Checador anti-invenção
- [x] Playground do checador no navegador
- [x] Tema claro/escuro e interface em português e inglês
- [x] Aderência fato × vaga: skills que batem, lacunas e fatos mais relevantes
- [x] Prompt e validação da resposta da LLM (sem depender de provedor) e renderização do currículo com dados reais
- [x] Editor do banco de fatos no navegador, com importação/exportação em JSON
- [x] Vaga e aderência, geração com a sua chave (Anthropic ou API compatível com OpenAI) e revisão das invenções
- [x] Exportação em PDF pela impressão do navegador (liberada só com zero invenções)
- [x] Publicação no GitHub Pages a cada push na `main`
- [x] Importação de currículo antigo (texto colado, PDF ou TXT): a LLM transcreve os fatos, o app aponta números e skills que
      não estão no texto e cada fato só entra no banco depois de confirmado

Banco remoto com Supabase e CLI estão planejados. Ainda não estão disponíveis.

## Desenvolvimento

Requer Node 22+ e pnpm. Instale o pnpm com `corepack enable` ou `npm i -g pnpm`.

```powershell
pnpm install
pnpm --filter @encaixe/web dev
```

O app fica em http://localhost:5173. Veja setup, scripts e regras em [CONTRIBUTING.md](CONTRIBUTING.md).

## Decisões

Veja as decisões de produto e arquitetura em [docs/decisions.md](docs/decisions.md).

## Licença

MIT. Links de doação estão planejados.
