import { DecisionDistributionChart } from '@/features/decision-trace/components/overview/decision-distribution-chart';
import { getDecisions } from '@/features/decision-trace/api/service';

export default async function PieStats() {
  const decisions = await getDecisions();
  const total = decisions.length;
  const categories = [
    { name: 'Infrastructure', color: 'oklch(0.48 0.16 265)' },
    { name: 'Security & Auth', color: 'oklch(0.62 0.13 195)' },
    { name: 'Compliance', color: 'oklch(0.70 0.14 70)' },
    { name: 'API Platform', color: 'oklch(0.60 0.15 150)' }
  ];

  const data =
    total > 0
      ? categories.map((cat) => {
          const count = decisions.filter((d) =>
            d.category.toLowerCase().includes(cat.name.toLowerCase().split(' ')[0])
          ).length;
          return {
            category: cat.name,
            value: Math.round((count / total) * 100) || 0,
            fill: cat.color
          };
        })
      : [];

  return <DecisionDistributionChart data={data} />;
}
