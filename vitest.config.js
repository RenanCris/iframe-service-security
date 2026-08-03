import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 1. Emula o ecossistema do navegador (API window, document, iframe) de forma leve e segura
    environment: "happy-dom",

    // 2. Torna funções como describe, test, expect, vi globais (evita precisar importá-las em cada arquivo)
    globals: true,

    // 3. Executa uma limpeza automática de mocks entre cada teste para evitar poluição de memória
    restoreMocks: true,

    // 4. Configuração opcional para relatórios de cobertura de código (Code Coverage)
    coverage: {
      provider: "v8", // Provedor nativo do Node.js, mais rápido e seguro
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "vitest.config.js"],
    },
  },
});
