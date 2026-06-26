import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const appUrl = import.meta.env.VITE_APP_URL as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("As variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar configuradas.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export const auth = supabase.auth;

export function getSupabaseAppUrl() {
  const fallbackUrl = typeof window !== "undefined" ? window.location.origin : "";
  return (appUrl || fallbackUrl).trim().replace(/\/+$/, "");
}

export async function signInWithGoogle() {
  const redirectTo = getSupabaseAppUrl();
  if (!redirectTo) {
    throw new Error("A URL do app não está configurada para o login OAuth.");
  }

  return auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });
}
