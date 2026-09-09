import Link from "next/link";
import type { ReactNode } from "react";

export default function EmptyState({
  icon,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="animate-rise-in flex flex-col items-center gap-3 rounded-2xl border border-dashed py-14 px-6 text-center" style={{ borderColor: "var(--border)" }}>
      <div style={{ color: "var(--secondary)" }}>{icon}</div>
      <p className="font-display text-xl font-semibold">{title}</p>
      <p className="text-muted max-w-xs text-sm">{description}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn-primary mt-2 rounded-xl px-5 py-2.5 text-sm font-semibold">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
