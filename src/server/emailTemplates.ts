/**
 * Gabarit visuel commun a tous les emails transactionnels Jungly (beta,
 * reinitialisation de mot de passe...) -- extrait de betaSignup.ts pour
 * eviter que deux gabarits divergent avec le temps.
 */
export function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:32px 16px;background:#f4f0e2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#23281f;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;">
    <p style="font-size:0.78rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#3f9a58;margin:0 0 12px;">Jungly</p>
    <h1 style="font-size:1.3rem;margin:0 0 16px;color:#17503a;">${title}</h1>
    ${bodyHtml}
  </div>
</body>
</html>`;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}
