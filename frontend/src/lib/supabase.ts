/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';
import { appConfig } from './runtimeConfig';

const supabaseUrl = appConfig.supabaseUrl;
const supabaseAnonKey = appConfig.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Returns the current session's access token, or empty string if not logged in.
 * Used by the API client to attach Bearer tokens.
 */
export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}
