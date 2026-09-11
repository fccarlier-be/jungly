import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // better-sqlite3 (adapter Prisma, voir src/server/db.ts) embarque un
  // binaire natif (.node) : sans cette exclusion, le bundling webpack du
  // build standalone deplace/reecrit ses references de chemin et casse la
  // resolution du binding a l'execution ("Could not locate the bindings
  // file"). Ici, le module est requis tel quel depuis node_modules au
  // runtime plutot que d'etre trace/bundle.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3", "bindings"],
  // Content-Security-Policy est posee dynamiquement par proxy.ts (nonce par
  // requete, necessaire pour le script inline d'initialisation du theme) --
  // les headers statiques ci-dessous n'ont pas besoin d'un nonce et
  // s'appliquent aussi aux routes /api/* (hors du matcher de proxy.ts).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // camera/microphone/geolocation : aucune fonctionnalite de l'app
          // n'y recourt (la recherche de ville en meteo passe par une API
          // texte cote serveur, pas par la geolocalisation navigateur).
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
