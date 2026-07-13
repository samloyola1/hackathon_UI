import ReportDashboard from './ReportDashboard';

export default function FacilityDashboard() {
  return <ReportDashboard title="Facility Dashboard" subjectFallback="facility.dashboard" endpointPath="/api/facility-dashboard/reports" shieldIcon="🏭" />;
}