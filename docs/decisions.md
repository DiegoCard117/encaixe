# Decisões

Registro curto do que foi decidido e por quê. Vale para humanos e para agentes de IA que trabalham no repo.
Mudou de ideia? Edite a linha e diga o motivo no commit.

## Princípio

- **Nada é inventado.** Todo texto gerado cita os fatos de onde veio (`sourceFactIds`) e passa pelo `checkResumeDraft`. Dado de cadastro (empresa, cargo, datas, skills) nunca é escrito pela LLM: ela devolve ids e o renderizador busca o valor real.

## Arquitetura

- **Core puro.** `packages/core` não tem UI, disco, rede nem DOM. Web e CLI são cascas finas sobre ele.
- **CLI sem build e sem npm por enquanto:** `pnpm cli` roda o TypeScript com `tsx` dentro do repo. Valida, checa e calcula aderência; geração com LLM continua só na web. Publicar no npm quando alguém pedir.
- **LLM com a chave do usuário, direto do navegador.** Sem backend nosso: custo zero e nenhum dado passa por servidor do projeto.
- **O usuário escolhe o provedor de LLM: Anthropic ou qualquer API compatível com OpenAI.** Chamada direta do navegador: Anthropic pelo SDK oficial (`@anthropic-ai/sdk` com `dangerouslyAllowBrowser`, carregado sob demanda, modelo sugerido pela lista da conta e, no Opus/Sonnet 5.5, fallback do servidor em caso de recusa); compatível com OpenAI por `fetch`, com atalhos para OpenAI, Gemini, Groq, OpenRouter e Ollama, para que o app possa ser usado sem pagar (camadas gratuitas ou modelo local). O core recebe a função de chamada, então novos provedores entram sem mexer na lógica.
- **Modelos vêm do provedor, não de uma lista fixa.** Nomes mudam e variam por conta (ex.: modelo antigo indisponível para contas novas). O app lê `/models`, ordena por preferência (no Gemini, flash antes de flash-lite, versão mais nova primeiro) e guarda um plano B: os próximos da lista e sempre um modelo leve (lite/mini/haiku). Só erro de modelo indisponível ou sobrecarregado aciona o plano B; chave inválida, limite de uso e recusa param na hora.
- **Chave da API só na sessão por padrão**, com opção explícita de lembrar neste navegador.
- **Toda chamada à LLM tem tempo limite de 5 minutos e pode ser cancelada.** O limite vale para a chamada inteira, incluindo as tentativas do plano B; modelo local ganha 10 minutos, porque roda no PC da pessoa e "raciocina" antes de responder (raciocínio fica ligado: sem ele, o qwen3:8b não extraiu nenhuma conquista de um currículo real). Modelo local lento ou servidor travado não prende a tela. Enquanto a LLM trabalha, a tela mostra um indicador, frases que mudam conforme a etapa e o tempo decorrido, para deixar claro que não travou (sem animação com "reduzir movimento"; o contador não é anunciado a cada segundo por leitores de tela).
- **Aderência fato × vaga determinística** (termos, skills e tags), sem embeddings: explicável, offline e testável. Skills implícitas por uma lista curta e explícita (`IMPLIED_SKILLS`: SQL via MySQL/PostgreSQL, JavaScript via TypeScript/React, Python via Django…) contam como atendidas, não como lacuna — e por isso a LLM não é instruída a evitá-las. Só relações óbvias e de mão única.
- **Sem telemetria.**
- **Segurança em camadas, sem servidor** (detalhes em [SECURITY.md](../SECURITY.md)): tudo que vem de fora (JSON importado, Supabase, LLM) passa pelos schemas; links só `http`/`https`; nada vira HTML; CSP no site publicado (scripts só do próprio site, conexões só HTTPS e Ollama local); link de conexão só é aceito depois de a pessoa confirmar o projeto; sessões não são copiadas entre aparelhos.
- **Apoio discreto: Pix (chave aleatória) e GitHub Sponsors.** Pix para quem usa no Brasil, Sponsors para quem chega pelo GitHub e de fora. No app só um link no rodapé e uma linha depois de exportar o PDF, nunca pop-up nem pedido antes de entregar valor. Dados em `apps/web/src/support.ts`; vazio esconde.

## Persistência

- **Local por padrão, sem conta e sem servidor:** o banco de fatos fica no navegador (localStorage) e pode ser exportado/importado em JSON.
- **Banco de dados opcional, no Supabase.** Quem quiser pode ligar um banco para persistir e sincronizar entre dispositivos (cada pessoa liga o próprio projeto Supabase; o Encaixe não mantém servidor). O app nunca exige isso: tudo funciona sem banco.
- **Como a sincronização funciona:** o navegador continua sendo a fonte da tela; o SDK do Supabase só é baixado por quem conecta. Login por link mágico (PKCE) ou pelo código de 6 dígitos do mesmo e-mail (o link no celular costuma abrir no navegador do app de e-mail, onde o PKCE falha); os parâmetros de login saem da URL depois de usados. Para não depender do limite de e-mails do plano gratuito, quem já entrou define uma senha e os outros aparelhos entram com e-mail e senha; um link de conexão (URL e chave pública depois do `#`) preenche a configuração no outro aparelho. Copiar a sessão entre aparelhos foi descartado: o token de renovação é de uso único e a reutilização encerraria as duas sessões, tabela `fact_banks` com RLS (cada login vê só o próprio banco, [docs/supabase.sql](supabase.sql)). Decisão em três vias contra a última sincronização: só um lado mudou → copia; os dois mudaram → pergunta qual manter. Remoto inválido nunca sobrescreve o local. Chave secreta (`service_role`, `sb_secret_`) é recusada.
- **Zona de perigo:** "Apagar tudo deste navegador" remove dados do app (`encaixe.*`, exceto tema e idioma) e a sessão do Supabase, com confirmação digitando APAGAR e oferta de exportar antes. Apagar também o banco no Supabase é opcional e desmarcado; se a exclusão remota falhar, nada local é apagado.
- O formato persistido é sempre o `FactBank` validado pelo `FactBankSchema`, seja no navegador, no JSON ou no banco.

## Interface

- **React + Vite**, publicado no GitHub Pages pelo Actions a cada push na `main`. Pages em vez de Vercel: o app é estático, sem servidor nem variável de ambiente, e fica tudo no GitHub. Build com caminhos relativos (`base: "./"`) e rotas por hash, então funciona em `/encaixe/`, em forks e em domínio próprio sem configuração.
- **Tailwind** para estilo e **react-hook-form + zod** reaproveitando os schemas do core. Componentes do shadcn/ui só quando precisar.
- **i18n desde o primeiro componente: pt-BR e en.** Nenhum texto de interface fica fixo no JSX; tudo sai de dicionários tipados por idioma (o TypeScript garante que os dois têm as mesmas chaves), datas e números via `Intl`. Sem biblioteca enquanto isso bastar. Idioma inicial: o do navegador, com troca manual.
- **O core não fala com o usuário.** Ele devolve códigos (`code`, `value`, `path`), nunca frases; a tradução é da interface. Vale para violações e erros de validação. A interface mostra o `path` em linguagem comum ("Experiência 1 · item 2", "Python · Nome"); o caminho técnico só aparece no playground.
- **Vocabulário:** "skill" em pt-BR também, como no resto da área de tecnologia.
- O idioma da interface e o do currículo gerado são independentes (`locale` do banco).
- **Tema claro e escuro desde o início.** Cores só por tokens (variáveis CSS) com valor para cada tema; segue o sistema por padrão, com troca manual. A prévia do currículo é "papel" e continua clara no tema escuro, como o PDF.
- **Celular primeiro-classe:** layout em uma coluna até 375px sem rolagem lateral, alvos de toque de 40px ou mais e campos com fonte de 16px no celular (abaixo disso o iOS dá zoom ao focar). Janelas viram painel que sobe de baixo no celular, com cabeçalho fixo, e a página de trás não rola enquanto há janela aberta. Para encurtar a rolagem: skills como etiquetas, conquistas recolhidas sob cada experiência, barra de atalhos por seção, ações raras (arquivar, excluir) dentro da janela de edição e Supabase/zona de perigo em "Configurações".
- **Currículo feito para ATS e IAs de RH:** uma coluna, texto real, títulos de seção padrão (Resumo profissional, Experiência profissional, Projetos, Formação acadêmica, Certificações e cursos, Habilidades, Idiomas) no idioma do currículo, datas MM/AAAA, cargo numa linha e empresa · cidade · período na outra, habilidades separadas por vírgula com as da vaga primeiro, sem ligaduras de fonte e com o idioma do documento igual ao do currículo. Experiências sempre em ordem cronológica inversa (garantida no render, não pela LLM) e todas incluídas, para não deixar buracos na linha do tempo; habilidades agrupadas por tipo e limitadas a 20, as da vaga primeiro; idiomas com nível (inclui nativo e fluente). Título e resumo sempre gerados e alinhados à vaga; responsabilidades e requisitos pesam mais que diferenciais; o mesmo trabalho não aparece duas vezes; tempo verbal consistente. Tudo genérico: nenhuma regra assume tecnologia ou um tipo de vaga. A geração espelha o vocabulário da vaga quando um fato citado sustenta, e pode usar termos implícitos (SQL via MySQL); o checador continua barrando o que não tem fonte.
- **Saída em PDF** pelo CSS de impressão, com um modelo legível por ATS no MVP.

## Identidade visual

Prévia: canvas "Encaixe — prévia do MVP" (banco de fatos, aderência, revisão clara e escura).

- **Tom:** sóbrio e confiável. "Seu currículo, encaixado na vaga. Sem inventar nada."
- **Logo:** duas peças que se encaixam (recorte + dente).
- **Tipografia:** Space Grotesk (títulos), Inter (texto), JetBrains Mono (ids de fatos).
- **Cores:** destaque verde-petróleo; laranja só para invenções e lacunas (não vermelho, para não depender de vermelho/verde).

| Token                          | Claro                             | Escuro                            |
| ------------------------------ | --------------------------------- | --------------------------------- |
| fundo                          | `#F6F6F3`                         | `#111317`                         |
| superfície                     | `#FFFFFF`                         | `#1A1D23`                         |
| texto                          | `#15171C`                         | `#ECEDEF`                         |
| texto suave                    | `#5B6070`                         | `#A3A8B3`                         |
| linha                          | `#E3E3DE`                         | `#2C3038`                         |
| destaque                       | `#0E6B5C`                         | `#3CC3A3`                         |
| destaque suave (fundo / texto) | `#E3F1EE` / `#0A4F44`             | `#12332D` / `#8FE0CB`             |
| alerta (fundo / texto / borda) | `#FDEDE3` / `#8A3109` / `#F0CDB8` | `#3A2216` / `#F6B48E` / `#6B3A22` |

## Produto

- **Público inicial: tecnologia**, com o schema genérico o bastante para outras áreas.

## User flow do MVP

Abrir o app → montar o banco de fatos → colar a vaga → ver a aderência → gerar com a LLM → revisar → exportar PDF.

- **Sem conta nem login.** O banco remoto é só sincronização opcional, nunca barreira.
- **Três entradas para o banco de fatos:** importar currículo antigo (a LLM extrai fatos e o usuário confirma cada um), carregar JSON ou começar do zero.
- **Importar currículo antigo:** texto colado, PDF ou TXT. O PDF é lido no navegador (`pdfjs-dist`, carregado só quando usado); PDF escaneado não tem texto e o app pede para colar. A LLM só transcreve para o formato do banco; o core corrige ids fora do formato e renomeia ids repetidos (dois cargos na mesma empresa), divide descrição ou resumo longo demais em conquistas do mesmo fato (só reorganiza o texto do currículo), descarta só o que não tem conserto e lista na revisão o que ignorou, com o campo e o problema, troca os ids, reaproveita skills que já estão no banco e aponta números e skills que não aparecem no texto original (telefone, e-mail e links não contam como prova). Nada entra sem confirmação, e itens com alerta não entram no "confirmar todos". Se o texto colado for uma vaga (requisitos, diferenciais, benefícios), a LLM responde `notResume` e nada é criado: as skills que a vaga pede virariam fatos falsos, e o checador não perceberia, porque os termos estão no texto. A revisão em andamento fica salva no navegador até ser adicionada ao banco ou descartada (a tela avisa e tem "Descartar revisão"), para não pagar outra extração por causa de um recarregamento.
- **Lacuna não vira invenção.** Skill da vaga que não está no banco aparece como lacuna; a única saída é cadastrar um fato real.
- **Chave da LLM pedida só na primeira geração**, não no onboarding.
- **PDF só sai com zero violações.** Para destravar: editar, remover o bullet ou regenerar.
- Fora do MVP: histórico de candidaturas e múltiplos modelos de currículo.
