import { Leaf } from "lucide-react";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: "var(--primary-soft)", color: "var(--primary-strong)" }}
        >
          <Leaf size={26} strokeWidth={1.75} />
        </div>
        <h1 className="font-display text-2xl font-semibold" style={{ color: "var(--primary-strong)" }}>
          Jungly
        </h1>
        <p className="text-muted text-sm">Réinitialise ton mot de passe.</p>
      </div>

      <ForgotPasswordForm />
    </div>
  );
}
