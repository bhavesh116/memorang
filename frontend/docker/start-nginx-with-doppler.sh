#!/bin/sh
set -eu

CONFIG_JSON="$(jq -n \
  --arg supabaseUrl "${VITE_SUPABASE_URL:-}" \
  --arg supabaseAnonKey "${VITE_SUPABASE_ANON_KEY:-}" \
  --arg backendUrl "${VITE_BACKEND_URL:-}" \
  '{
    VITE_SUPABASE_URL: $supabaseUrl,
    VITE_SUPABASE_ANON_KEY: $supabaseAnonKey,
    VITE_BACKEND_URL: $backendUrl
  }')"

printf 'window.__APP_CONFIG__ = %s;\n' "$CONFIG_JSON" > /usr/share/nginx/html/app-config.js

exec nginx -g 'daemon off;'
