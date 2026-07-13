import ReportDashboard from './ReportDashboard';

export default function PalletDashboard() {
  return <ReportDashboard title="Pallet Dashboard" subjectFallback="pallet.Dashboard" endpointPath="/api/pallet-dashboard/reports" shieldIcon="📦" />;
}