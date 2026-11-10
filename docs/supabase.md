# Sincronização opcional com Supabase

O banco local continua sendo o padrão. Para sincronizar entre dispositivos, use seu próprio projeto Supabase:

1. Crie um projeto gratuito em [Supabase](https://supabase.com/).
2. Abra o **SQL Editor**, cole o conteúdo de [supabase.sql](./supabase.sql) e execute.
3. Em **Authentication → URL Configuration**:
   - **Site URL**: troque o padrão (`http://localhost:3000`) por `https://diegocard117.github.io/encaixe/`. Sem isso, o link do e-mail leva para o localhost.
   - **Redirect URLs**: adicione `https://diegocard117.github.io/encaixe/**` e, para desenvolvimento, `http://localhost:5173/**`.
4. Para entrar também pelo celular (onde o link costuma abrir no navegador do app de e-mail), inclua o código no e-mail: em **Authentication → Emails → Magic Link**, acrescente ao modelo a linha `Código: {{ .Token }}` e salve.
5. Em **Project Settings → API**, copie **Project URL** e a chave pública **anon** ou **publishable**. Nunca use a chave secreta (`service_role` ou `sb_secret_`).
6. No banco de fatos do app, abra **Configurações** (ou, num aparelho ainda sem banco, use o cartão na tela inicial) e clique em **Conectar Supabase**, informe a URL e a chave pública e salve.
7. Informe seu e-mail e clique em **Enviar link de acesso**. Abra o link recebido **neste mesmo navegador** ou digite o código de 6 dígitos do e-mail em **Entrar com o código** (funciona mesmo se o link abrir em outro navegador).
8. Já conectado, em **Configurações**, defina uma senha em **Senha para entrar em outros aparelhos**. Ela evita o limite de e-mails: os outros aparelhos entram com e-mail e senha, sem esperar e-mail nenhum.

## Outros aparelhos

No aparelho já conectado, toque em **Copiar link de conexão** e abra o link no outro (pelo WhatsApp Web, por exemplo). O link leva a URL do projeto, a chave pública e o seu e-mail depois do `#`, parte do endereço que o navegador não envia a servidor nenhum. No outro aparelho, escolha **Entrar com senha**.

Cada aparelho tem a própria sessão. Copiar a sessão de um aparelho para outro não funciona: o Supabase troca o token de renovação a cada uso e encerraria a sessão dos dois.

## Limite de e-mails

O e-mail padrão do Supabase envia poucos e-mails de login por hora no plano gratuito ("email rate limit exceeded"). Com senha definida, você quase não precisa de e-mail. Para tirar o limite de vez, configure um servidor de e-mail próprio em **Project Settings → Authentication → SMTP Settings** (por exemplo, o plano gratuito do Resend) e ajuste o limite em **Authentication → Rate Limits**.

Quando os dois lados mudam, o app pergunta qual versão manter antes de substituir dados. A política RLS garante que cada login vê e altera somente seu próprio banco.

**Sair** encerra a sessão neste navegador. **Remover conexão** também apaga a configuração e o histórico de sincronização; seus dados locais ficam. Sem configurar o Supabase, tudo continua local e o SDK não é carregado.
