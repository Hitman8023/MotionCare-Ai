import PatientOverview from "../components/PatientOverview";
import Vitals from "../components/Vitals";
import ProgressAlerts from "../components/ProgressAlerts";

type DashboardProps = {
  patientUid: string;
  displayName?: string;
};

export default function Dashboard({
  patientUid,
  displayName = "",
}: DashboardProps) {
  return (
    <>
      <div className="page-header">
        <div className="page-title">Patient Recovery Dashboard</div>
        <div className="page-subtitle">
          <span className="live-dot"></span>
          Live · Last updated just now · Session #14 · Dr. Rachel Moore, PT
        </div>
      </div>
      <PatientOverview patientUid={patientUid} displayName={displayName} />
      <Vitals patientUid={patientUid} />
      <ProgressAlerts patientUid={patientUid} />
    </>
  );
}
