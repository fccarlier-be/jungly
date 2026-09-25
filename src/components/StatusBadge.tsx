import { STATUS_LABEL, type PlantStatus } from "@/lib/plantStatus";

/** label : libelle combine taches + sante (computeOverallStatus), sinon celui du seul statut. */
export default function StatusBadge({ status, label }: { status: PlantStatus; label?: string }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className={`status-dot status-${status}`} />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
