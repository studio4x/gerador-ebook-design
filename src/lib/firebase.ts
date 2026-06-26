import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const appUrl = import.meta.env.VITE_APP_URL as string | undefined;
const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const noopAuth = {
  async getSession() {
    return { data: { session: null }, error: null };
  },
  onAuthStateChange() {
    return {
      data: {
        subscription: {
          unsubscribe() {},
        },
      },
    };
  },
  async signInWithOAuth() {
    return {
      data: { provider: "google" as const, url: null },
      error: new Error("Supabase Auth não está configurado nesta implantação."),
    };
  },
  async signOut() {
    return { error: null };
  },
};

export const supabase = isConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : ({
      auth: noopAuth,
    } as any);

export const auth = supabase.auth as typeof noopAuth & {
  getSession: () => Promise<{ data: { session: null } | { session: any }; error: any }>;
  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    data: { subscription: { unsubscribe: () => void } };
  };
  signInWithOAuth: (args: { provider: string; options?: { redirectTo?: string } }) => Promise<{
    data: { provider: "google"; url: string | null };
    error: Error | null;
  }>;
  signOut: () => Promise<{ error: Error | null }>;
};

export function isSupabaseConfigured() {
  return isConfigured;
}

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
