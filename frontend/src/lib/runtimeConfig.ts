type RuntimeConfig = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_BACKEND_URL?: string;
};

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimeConfig;
  }
}

const runtimeConfig =
  typeof window !== 'undefined' ? (window.__APP_CONFIG__ ?? {}) : {};

export const appConfig = {
  supabaseUrl:
    runtimeConfig.VITE_SUPABASE_URL ?? (import.meta.env.VITE_SUPABASE_URL as string) ?? '',
  supabaseAnonKey:
    runtimeConfig.VITE_SUPABASE_ANON_KEY ??
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ??
    '',
  backendUrl:
    runtimeConfig.VITE_BACKEND_URL ?? (import.meta.env.VITE_BACKEND_URL as string) ?? '',
};

export {};
