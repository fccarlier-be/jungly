"use client";

import { useState } from "react";
import { Eye, EyeOff } from "@/components/icons";

/**
 * Champ mot de passe avec un bouton pour afficher/masquer la saisie (retour
 * utilisateur, 2026-10-03) -- bascule entre type="password" et type="text",
 * jamais de champ en double. Remplace les <input type="password"> nus de
 * login/page.tsx, RegisterForm.tsx et ResetPasswordForm.tsx.
 */
export default function PasswordField({
  id,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input w-full py-2 pl-3 pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="text-muted absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg"
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
