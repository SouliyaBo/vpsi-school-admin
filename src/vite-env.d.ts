/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_DOCS_URL?: string;
  readonly VITE_DEFAULT_LOCALE?: 'lo' | 'en';
  readonly VITE_SCHOOL_NAME_LO?: string;
  readonly VITE_SCHOOL_NAME_EN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
