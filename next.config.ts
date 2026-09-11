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
};

export default nextConfig;
