# Segurança

## Como reportar uma falha

Não abra uma issue pública. Use o [reporte privado de vulnerabilidades do GitHub](https://github.com/DiegoCard117/encaixe/security/advisories/new) ("Report a vulnerability"), com os passos para reproduzir. A resposta vem assim que possível; correções de segurança têm prioridade.

## Modelo de segurança

O Encaixe roda inteiro no navegador. O projeto não tem servidor próprio nem telemetria.

| Dado                               | Onde fica                                                                                | Para onde vai                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Banco de fatos, vaga, rascunho     | `localStorage` do navegador                                                              | Para o provedor de LLM nas chamadas; Supabase da própria pessoa, se ligado |
| Chave da LLM                       | `sessionStorage` (some ao fechar a aba); `localStorage` só com "Lembrar neste navegador" | Só para o provedor escolhido                                               |
| Sessão do Supabase                 | `localStorage` (biblioteca oficial do Supabase)                                          | Só para o projeto Supabase da própria pessoa                               |
| Revisão de importação em andamento | `localStorage`, até adicionar ao banco ou descartar                                      | —                                                                          |

**Defesas em camadas**

- **Texto, não HTML.** Nada que vem da LLM, de um JSON importado ou do Supabase é inserido como HTML; o React escapa tudo.
- **Links só `http`/`https`.** O formato do banco recusa `javascript:`, `data:`, `file:` e afins em qualquer link (perfil, projeto, credencial). O React 19 também bloqueia `javascript:` na renderização.
- **Content Security Policy** no site publicado: só scripts do próprio site (o script inline do tema entra por hash), conexões apenas com HTTPS (provedores de LLM e Supabase) e com o Ollama local, sem `object`, sem `base` alterável.
- **Tudo que vem de fora é validado** com os schemas do core antes de ser usado: banco importado, banco remoto do Supabase e resposta da LLM. Um banco remoto inválido nunca sobrescreve o local.
- **Supabase:** cada pessoa usa o próprio projeto. A tabela `fact_banks` tem RLS (cada login vê e altera só a própria linha) e permissões só para o papel `authenticated`. O app recusa chave secreta (`service_role`, `sb_secret_`).
- **Link de conexão:** leva só a URL do projeto, a chave pública e o e-mail, depois do `#` (o navegador não envia essa parte a servidor nenhum). Antes de salvar, o app mostra o endereço do projeto e avisa se vai substituir a conexão atual: um link pode apontar para o Supabase de outra pessoa, e conectar a ele mandaria o banco de fatos para lá.
- **Sessões não são copiadas entre aparelhos.** Cada aparelho entra com e-mail e código, link ou senha. O token de renovação do Supabase é de uso único; reutilizá-lo encerraria as duas sessões.
- **PDF:** lido com pdf.js 6, que não executa código gerado (`eval`); a falha de fontes CVE-2024-4367 é de versões antigas.
- **Ollama local** escuta só em `127.0.0.1` e só aceita a origem do app (`OLLAMA_ORIGINS`).
- **CI** com token só de leitura; o deploy do Pages usa só as permissões que o Pages exige.

## Riscos conhecidos e aceitos

- **Origem compartilhada no GitHub Pages.** Todos os sites de uma conta em `<usuário>.github.io` dividem a mesma origem e, portanto, o mesmo `localStorage`. Outro site publicado na mesma conta conseguiria ler as chaves e o banco do Encaixe e usar o Ollama liberado para essa origem. Não publique conteúdo de terceiros na mesma conta; para eliminar o risco, sirva o Encaixe num domínio próprio.
- **Chave da LLM no navegador.** É o preço de não ter servidor: uma falha que permitisse rodar código na página poderia lê-la (a CSP reduz esse risco). Por padrão a chave some ao fechar a aba.
- **Injeção de instruções (prompt injection).** Uma vaga ou um currículo pode trazer texto que tenta manipular a LLM. A saída é limitada por schema e pelo checador anti-invenção (fatos citados, tecnologias e números com fonte), e a pessoa revisa tudo antes do PDF; afirmações sem número nem tecnologia ainda dependem dessa revisão.
- **Ações do GitHub fixadas por versão principal** (`@v4`), não por hash de commit. Risco padrão de cadeia de suprimentos, aceito pelo tamanho do projeto.
- **Limite de e-mails do Supabase gratuito.** Não é falha de segurança, mas afeta o login; veja [docs/supabase.md](docs/supabase.md).
