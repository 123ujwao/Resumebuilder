/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_AI_PROXY_URL?: string;
  readonly VITE_RESUME_PRODUCT_ID?: string;
  readonly VITE_COVER_LETTER_PRODUCT_ID?: string;
  readonly VITE_ENABLE_GOOGLE_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
