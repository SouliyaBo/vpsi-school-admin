/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_DOCS_URL?: string;
  readonly VITE_DEFAULT_LOCALE?: 'lo' | 'en';
  readonly VITE_SCHOOL_NAME_LO?: string;
  readonly VITE_SCHOOL_NAME_EN?: string;

  /*
   * Build stamps, written by `define` in `vite.config.ts` rather than by a
   * `.env` file — they describe the build, so nothing outside it can set them.
   * Read them through `lib/build-info`, which copes with a context where that
   * config never ran.
   */
  readonly VITE_APP_VERSION?: string;
  readonly VITE_BUILD_COMMIT?: string;
  readonly VITE_BUILD_TIME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
