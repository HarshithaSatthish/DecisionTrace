import { DecisionDistributionChart } from '@/features/decision-trace/components/overview/decision-distribution-chart';
import { getDecisions } from '@/features/decision-trace/api/server';
import { buildCategoryDistribution } from '@/lib/decision-categories';

export default async function PieStats() {
  const decisions = await getDecisions();
  return <DecisionDistributionChart data={buildCategoryDistribution(decisions)} />;
}
