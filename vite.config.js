import { defineConfig } from 'vite';

// base './' : le site fonctionne dans un sous-dossier comme à la racine.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2022' },
  // Vitest ne lit que tests/ : les scénarios Playwright de e2e/ ont leur propre lanceur.
  test: { include: ['tests/**/*.test.js'] },
});
