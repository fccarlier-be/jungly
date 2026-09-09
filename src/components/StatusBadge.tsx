import { STATUS_LABEL, type PlantStatus } from "@/lib/plantStatus";

export default function StatusBadge({ status }: { status: PlantStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className={`status-dot status-${status}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}
