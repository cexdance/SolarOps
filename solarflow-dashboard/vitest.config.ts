import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.ts'],
    // src/lib/supabase.ts calls createClient() at module scope, so ANY test that
    // transitively imports syncEngine or dataStore throws "supabaseUrl is
    // required" when these are unset. .env is gitignored, so CI has no values
    // and every CI run has failed at the Test step since at least 2026-07-29,
    // making the check useless as a gate. Locally it passed only because .env
    // happened to supply real credentials.
    //
    // Deliberately fake, and deliberately NOT sourced from secrets: the suite
    // mocks Supabase everywhere and must never be able to reach a real project.
    // These also override .env locally, so a test run is identical on both.
    env: {
      VITE_SUPABASE_URL:      'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key-not-a-real-credential',
      // api/_auth.ts returns 500 "Server auth not configured" when this is
      // absent, which would mask the 401/503 paths its tests exist to pin.
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-a-real-credential',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('test'),
    __BUILD_ID__:    JSON.stringify('test'),
    __BUILT_AT__:    JSON.stringify(new Date().toISOString()),
    __DB_VERSION__:  JSON.stringify('test'),
  },
});
