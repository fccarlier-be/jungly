import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // On tourne toujours derrière un reverse proxy (nginx-plantes + Cloudflare
  // Tunnel en prod, ou un simple port-forward en dev/test) : le Host vu par
  // le processus Next.js ne correspond pas forcément 1:1 à AUTH_URL, d'où la
  // nécessité de faire confiance au Host transmis par le proxy.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : undefined;
        const password = typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!email || !password) {
          return null;
        }

        const user = await db.user.findUnique({ where: { email } });
        if (!user) {
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          return null;
        }

        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
      }
      // Déclenché côté client par `useSession().update({ name })` (voir
      // AccountSettings.tsx) : la session JWT ne relit jamais la base toute
      // seule, il faut donc rafraîchir le token explicitement après une
      // modification du profil pour que le nouveau nom apparaisse sans
      // devoir se déconnecter/reconnecter.
      if (trigger === "update" && session?.name) {
        token.name = session.name;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
