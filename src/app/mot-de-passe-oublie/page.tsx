import { LoginArt } from "@/components/art/paper";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <LoginArt className="h-20 w-auto" />
        <h1 className="font-logo text-4xl font-bold" style={{ color: "var(--primary-strong)" }}>
          Jungly
        </h1>
        <p className="text-muted text-sm">Réinitialise ton mot de passe.</p>
      </div>

      <ForgotPasswordForm />
    </div>
  );
}
