import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // next-env.d.ts est un fichier genere par Next.js, jamais edite a la
    // main ("This file should not be edited") -- l'erreur triple-slash-
    // reference qu'ESLint y releve n'a pas de sens a corriger a la main.
    ignores: [".claude/**", ".next/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
