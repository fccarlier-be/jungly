import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    // Plusieurs tests d'integration partagent le meme fichier SQLite reel
    // (voir dueTasks/snoozeTaskById/imageMirror/fileGarbageCollector
    // .integration.test.ts) -- l'isolation par defaut de Vitest lance un
    // worker separe PAR FICHIER (18 processus, chacun avec son propre
    // client Prisma/moteur de requetes), execute EN PARALLELE : sur un
    // serveur qui heberge par ailleurs des dizaines d'autres conteneurs,
    // cette suroffre de processus simultanes provoque des timeouts
    // intermittents (constate le 2026-09-12, y compris sur un test
    // unitaire pur sans DB -- signe de saturation ressources, pas d'un bug
    // dans un test en particulier). Fichiers toujours en sequence : la
    // suite reste largement sous la minute (~140 tests), et la fiabilite
    // prime sur la vitesse pour une suite de cette taille.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@generated": path.resolve(__dirname, "./generated"),
    },
  },
});
