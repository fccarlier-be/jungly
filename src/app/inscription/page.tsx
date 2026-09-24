import Link from "next/link";
import { LoginArt } from "@/components/art/paper";
import { isRegistrationOpen } from "@/lib/registrationMode";
import RegisterForm from "@/components/RegisterForm";

export default function RegisterPage() {
  const open = isRegistrationOpen();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <LoginArt className="h-20 w-auto" />
        <h1 className="font-logo text-4xl font-bold" style={{ color: "var(--primary-strong)" }}>
          Jungly
        </h1>
        <p className="text-muted text-sm">{open ? "Crée ton compte pour suivre tes plantes." : "Accès sur invitation"}</p>
      </div>

      {open ? (
        <RegisterForm />
      ) : (
        <div className="card w-full max-w-sm space-y-4 p-6 text-center text-sm">
          <p>
            Cette instance de Jungly ne propose pas d&apos;inscription libre-service : l&apos;accès se fait via
            l&apos;application Android, après un achat unique.
          </p>
          <Link href="/login" className="font-medium" style={{ color: "var(--primary-strong)" }}>
            J&apos;ai déjà un compte
          </Link>
        </div>
      )}
    </div>
  );
}
