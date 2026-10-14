import { CommitmentVelocityChart } from '@/features/decision-trace/components/overview/commitment-velocity-chart';
import { getCommitments } from '@/features/decision-trace/api/service';

export default async function BarStats() {
  const commitments = await getCommitments();
  const data =
    commitments.length > 0
      ? [
          {
            status: 'Backlog',
            count: commitments.filter((c) => c.status === 'backlog').length,
            fill: 'oklch(0.55 0.05 250)'
          },
          {
            status: 'In Progress',
            count: commitments.filter((c) => c.status === 'in_progress').length,
            fill: 'oklch(0.48 0.16 265)'
          },
          {
            status: 'Blocked',
            count: commitments.filter((c) => c.status === 'blocked').length,
            fill: 'oklch(0.58 0.20 28)'
          },
          {
            status: 'Completed',
            count: commitments.filter((c) => c.status === 'completed').length,
            fill: 'oklch(0.58 0.15 155)'
          }
        ]
      : [];

  return <CommitmentVelocityChart data={data} />;
}
