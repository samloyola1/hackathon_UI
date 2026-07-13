import ReportDashboard from './ReportDashboard';

export default function VehicleDashboard() {
  return <ReportDashboard title="Vehicle Dashboard" subjectFallback="vehicle.Dashboard" endpointPath="/api/vehicle-dashboard/reports" shieldIcon="🚚" />;
}