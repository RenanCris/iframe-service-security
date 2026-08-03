import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.amd,
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      "prettier/prettier": "error", // Trata erros de formatação do Prettier como erros de Lint
      "no-unused-vars": "warn", // Avisa sobre variáveis criadas mas não utilizadas
      "no-console": "off", // Permite console.log (comum em projetos Node.js)
    },
  },

  prettierConfig,
];
