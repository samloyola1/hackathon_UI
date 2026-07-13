import ReportDashboard from './ReportDashboard';

export default function SupervisorDashboard() {
  return <ReportDashboard title="Supervisor Dashboard" subjectFallback="supervisor.Dashboard" endpointPath="/api/supervisor-dashboard/reports" shieldIcon="🧑‍💼" />;
}