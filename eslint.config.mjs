import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // next-env.d.ts est un fichier genere par Next.js, jamais edite a la
  // main ("This file should not be edited") -- l'erreur triple-slash-
  // reference qu'ESLint y releve n'a pas de sens a corriger a la main.
  globalIgnores([".claude/**", ".next/**", "next-env.d.ts"]),
]);

export default eslintConfig;
