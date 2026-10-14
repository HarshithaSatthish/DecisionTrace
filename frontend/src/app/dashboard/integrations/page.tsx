import PageContainer from '@/components/layout/page-container';
import { IntegrationHealth } from '@/features/decision-trace/components/integration-health';

export const metadata = { title: 'Integration health — DecisionTrace' };

export default function IntegrationsPage() {
  return (
    <PageContainer
      pageTitle='Integration health'
      pageDescription='Monitor your connected services and configure Omi conversation ingestion.'
    >
      <IntegrationHealth />
    </PageContainer>
  );
}
