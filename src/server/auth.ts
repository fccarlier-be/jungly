import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

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
      authorize: async (credentials, request) => {
        // Meme reponse (null -> "Email ou mot de passe incorrect") qu'un
        // echec d'identifiants normal : ne jamais reveler qu'une limite a
        // ete atteinte, ce qui donnerait a un attaquant un moyen de
        // distinguer un compte existant d'un rate limit generique.
        const ip = getClientIp(request);
        const { allowed } = checkRateLimit(`login:${ip}`, 10, 5 * 60 * 1000);
        if (!allowed) {
          return null;
        }

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

        return { id: user.id, email: user.email, name: user.name ?? undefined, isAdmin: user.isAdmin };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.isAdmin = user.isAdmin;
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
        session.user.isAdmin = (token.isAdmin as boolean | undefined) ?? false;
      }
      return session;
    },
  },
});
