# Sincronização opcional com Supabase

O banco local continua sendo o padrão. Para sincronizar entre dispositivos, use seu próprio projeto Supabase:

1. Crie um projeto gratuito em [Supabase](https://supabase.com/).
2. Abra o **SQL Editor**, cole o conteúdo de [supabase.sql](./supabase.sql) e execute.
3. Em **Authentication → URL Configuration → Redirect URLs**, adicione a URL do app: `https://diegocard117.github.io/encaixe/`. Para desenvolvimento, adicione também `http://localhost:5173/`.
4. Em **Project Settings → API**, copie **Project URL** e a chave pública **anon** ou **publishable**. Nunca use a chave secreta (`service_role` ou `sb_secret_`).
5. No banco de fatos do app, abra **Configurações** (ou, num aparelho ainda sem banco, use o cartão na tela inicial) e clique em **Conectar Supabase**, informe a URL e a chave pública e salve.
6. Informe seu e-mail, clique em **Enviar link de acesso** e abra o link recebido neste mesmo navegador. Repita a configuração nos outros dispositivos.

Quando os dois lados mudam, o app pergunta qual versão manter antes de substituir dados. A política RLS garante que cada login vê e altera somente seu próprio banco.

**Sair** encerra a sessão neste navegador. **Remover conexão** também apaga a configuração e o histórico de sincronização; seus dados locais ficam. Sem configurar o Supabase, tudo continua local e o SDK não é carregado.
