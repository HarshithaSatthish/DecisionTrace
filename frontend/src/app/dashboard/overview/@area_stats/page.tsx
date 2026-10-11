import { DecisionTrendsChart } from '@/features/decision-trace/components/overview/decision-trends-chart';
import { getDashboardMetrics } from '@/features/decision-trace/api/service';

export default async function AreaStats() {
  const metrics = await getDashboardMetrics();
  return <DecisionTrendsChart data={metrics.decisionTrend} />;
}
