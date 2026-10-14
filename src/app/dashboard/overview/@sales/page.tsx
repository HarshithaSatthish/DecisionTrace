import { RecentGuardianActivity } from '@/features/decision-trace/components/overview/recent-guardian-activity';
import { getActivity } from '@/features/decision-trace/api/server';

export default async function Sales() {
  const activity = await getActivity();
  return <RecentGuardianActivity initialActivities={activity} />;
}
