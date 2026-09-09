"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button onClick={() => signOut({ callbackUrl: "/login" })} className="chip w-full rounded-xl py-2.5 text-sm font-medium">
      Se déconnecter
    </button>
  );
}
