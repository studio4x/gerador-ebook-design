<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/d82b0a16-50eb-4307-b0cd-c9b480c1edea

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Supabase

Cloud sync now uses Supabase through the server API.

1. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in [.env.local](.env.local)
2. Apply the SQL migration at [supabase/migrations/20260626_create_ebooks_table.sql](supabase/migrations/20260626_create_ebooks_table.sql)
3. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_APP_URL` in [.env.local](.env.local)
4. Enable Google Auth in the Supabase dashboard
5. Add the redirect URLs used by the app, including `http://localhost:3000` for local development and the production app URL in `VITE_APP_URL`
