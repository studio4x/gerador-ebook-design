import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const appUrl = import.meta.env.VITE_APP_URL as string | undefined;
const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function getUrlAuthHashState(): "none" | "fresh" | "stale" {
  if (typeof window === "undefined" || !window.location.hash) {
    return "none";
  }

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);

  if (!params.has("access_token")) {
    return "none";
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(params.get("expires_at") || 0);
  const issuedAt = Number(params.get("issued_at") || 0);

  if ((expiresAt && expiresAt <= now) || (issuedAt && now - issuedAt > 120)) {
    return "stale";
  }

  return "fresh";
}

function clearUrlAuthHashIfStale() {
  if (typeof window === "undefined") return false;
  if (getUrlAuthHashState() !== "stale") return false;

  const cleanUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState({}, document.title, cleanUrl);
  return true;
}

const urlAuthHashWasCleared = clearUrlAuthHashIfStale();
const shouldDetectSessionInUrl = isConfigured && !urlAuthHashWasCleared && getUrlAuthHashState() === "fresh";

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
        detectSessionInUrl: shouldDetectSessionInUrl,
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

export function isCloudSyncEnabled() {
  const explicitValue = (import.meta.env.VITE_ENABLE_CLOUD_SYNC as string | undefined)?.trim().toLowerCase();
  if (explicitValue === "true") return true;
  if (explicitValue === "false") return false;

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1";
  }

  return false;
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
