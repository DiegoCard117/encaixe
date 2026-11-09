# Decisões

Registro curto do que foi decidido e por quê. Vale para humanos e para agentes de IA que trabalham no repo.
Mudou de ideia? Edite a linha e diga o motivo no commit.

## Princípio

- **Nada é inventado.** Todo texto gerado cita os fatos de onde veio (`sourceFactIds`) e passa pelo `checkResumeDraft`. Dado de cadastro (empresa, cargo, datas, skills) nunca é escrito pela LLM: ela devolve ids e o renderizador busca o valor real.

## Arquitetura

- **Core puro.** `packages/core` não tem UI, disco, rede nem DOM. Web e CLI são cascas finas sobre ele.
- **LLM com a chave do usuário, direto do navegador.** Sem backend nosso: custo zero e nenhum dado passa por servidor do projeto.
- **Um provedor de LLM no MVP.** O core recebe a função de chamada, então novos provedores entram sem mexer na lógica.
- **Chave da API só na sessão por padrão**, com opção explícita de lembrar neste navegador.
- **Aderência fato × vaga determinística** (termos, skills e tags), sem embeddings: explicável, offline e testável.
- **Sem telemetria.**

## Persistência

- **Local por padrão, sem conta e sem servidor:** o banco de fatos fica no navegador (localStorage) e pode ser exportado/importado em JSON.
- **Banco de dados opcional.** Quem quiser pode ligar um banco para persistir e sincronizar entre dispositivos. O app nunca exige isso: tudo funciona sem banco.
- O formato persistido é sempre o `FactBank` validado pelo `FactBankSchema`, seja no navegador, no JSON ou no banco.

## Interface

- **React + Vite**, publicado no GitHub Pages.
- **Tailwind** para estilo e **react-hook-form + zod** reaproveitando os schemas do core. Componentes do shadcn/ui só quando precisar.
- **i18n desde o primeiro componente: pt-BR e en.** Nenhum texto de interface fica fixo no JSX; tudo sai de dicionários tipados por idioma (o TypeScript garante que os dois têm as mesmas chaves), datas e números via `Intl`. Sem biblioteca enquanto isso bastar. Idioma inicial: o do navegador, com troca manual.
- **O core não fala com o usuário.** Ele devolve códigos (`code`, `value`, `path`), nunca frases; a tradução é da interface. Vale para violações e erros de validação.
- O idioma da interface e o do currículo gerado são independentes (`locale` do banco).
- **Tema claro e escuro desde o início.** Cores só por tokens (variáveis CSS) com valor para cada tema; segue o sistema por padrão, com troca manual. A prévia do currículo é "papel" e continua clara no tema escuro, como o PDF.
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
- **Lacuna não vira invenção.** Skill da vaga que não está no banco aparece como lacuna; a única saída é cadastrar um fato real.
- **Chave da LLM pedida só na primeira geração**, não no onboarding.
- **PDF só sai com zero violações.** Para destravar: editar, remover o bullet ou regenerar.
- Fora do MVP: histórico de candidaturas e múltiplos modelos de currículo.

## Em aberto

- Qual banco/serviço usar na persistência opcional.
- Provedor de LLM do MVP.
