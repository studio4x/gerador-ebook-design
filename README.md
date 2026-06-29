<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Gerador de E-books

Editor para criação, revisão, paginação e exportação de e-books com preview A4, exportação em PDF/EPUB e sincronização em nuvem.

## Links do projeto

- Repositório GitHub: `https://github.com/studio4x/gerador-ebook-design`
- App no AI Studio: `https://ai.studio/apps/d82b0a16-50eb-4307-b0cd-c9b480c1edea`
- Branch principal de publicação: `main`

## Fluxo obrigatório para agentes e manutenção

1. Toda alteração no projeto deve incrementar a build estática em `src/App.tsx`
2. A versão segue SemVer, normalmente com incremento de `Patch`
3. Após mudanças concluídas, execute `npm run lint` e `npm run build`
4. Se a tarefa envolver publicação, faça `commit` e `push` em `main`
5. Nunca inclua no commit mudanças locais não relacionadas

## Execução local

**Pré-requisito:** Node.js

1. Instale as dependências:
   `npm install`
2. Configure as variáveis em [.env.local](.env.local)
3. Rode o app:
   `npm run dev`

O comando acima sobe o frontend Vite junto com o servidor Express definido em `server.ts`, que expõe as rotas `/api/*`.

## Variáveis de ambiente

- `GEMINI_API_KEY`: uso do Gemini
- `APP_URL`: URL base do app hospedado
- `SUPABASE_URL`: URL do projeto Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: chave server-side usada pela API
- `VITE_SUPABASE_URL`: URL pública para autenticação no cliente
- `VITE_SUPABASE_ANON_KEY`: chave pública do Supabase
- `VITE_APP_URL`: URL pública do app para redirecionamento OAuth
- `VITE_SERVER_API_BASE_URL`: URL opcional de uma API externa quando o frontend estiver em um host estático sem `server.ts`
- `VITE_ENABLE_CLOUD_SYNC`: habilita a sincronização em nuvem fora do localhost quando a rota `/api/cloud/*` estiver realmente publicada
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: envio de e-mail

Consulte o modelo em [.env.example](.env.example).

## Supabase

1. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in [.env.local](.env.local)
2. Apply the SQL migration at [supabase/migrations/20260626_create_ebooks_table.sql](supabase/migrations/20260626_create_ebooks_table.sql)
3. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_APP_URL` in [.env.local](.env.local)
4. Enable Google Auth in the Supabase dashboard
5. Add the redirect URLs used by the app, including `http://localhost:3000` for local development and the production app URL in `VITE_APP_URL`

## Exportação de PDF

- A rota principal de exportação é `POST /api/export-pdf`, atendida por `server.ts`
- Em deploy no Vercel, a rota `api/export-pdf` também existe como função serverless própria
- Em ambientes onde `/api/export-pdf` não estiver disponível, o cliente possui fallback de geração local no navegador
- Se houver `404` em `/api/cloud/projects`, o ambiente provavelmente está sem as rotas de sincronização em nuvem publicadas no mesmo host
- O build do Vercel não instala o Chrome local do Puppeteer; a função serverless usa `@sparticuz/chromium` para evitar estouro do limite de upload
- O cloud sync fica desativado por padrão fora do localhost e deve ser habilitado explicitamente com `VITE_ENABLE_CLOUD_SYNC=true` quando a API de nuvem estiver disponível

## Publicação

Fluxo recomendado:

1. Ajuste o código
2. Atualize a build em `src/App.tsx`
3. Rode `npm run lint`
4. Rode `npm run build`
5. Faça `git add` somente dos arquivos da tarefa
6. Faça `git commit -m "mensagem curta"`
7. Faça `git push origin main`
