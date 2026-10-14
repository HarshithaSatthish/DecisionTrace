import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getInsights } from '@/features/decision-trace/api/server';

export const metadata = { title: 'AI insights — DecisionTrace' };

export default async function InsightsPage() {
  const insights = await getInsights();
  return (
    <PageContainer
      pageTitle='AI insights'
      pageDescription='Stored analysis from ingested conversations, with source evidence and human review.'
    >
      <div className='space-y-4'>
        {insights.length === 0 ? (
          <p className='text-muted-foreground'>
            No analysis yet. Connect Omi and complete a conversation to begin.
          </p>
        ) : (
          insights.map((insight) => (
            <Card key={insight.id}>
              <CardHeader>
                <CardTitle className='text-base'>
                  {(insight.topic_key || insight.classification).replaceAll('_', ' ')}
                </CardTitle>
                <Badge variant='outline'>{insight.status.replaceAll('_', ' ')}</Badge>
              </CardHeader>
              <CardContent className='space-y-3'>
                <p>{insight.explanation}</p>
                {insight.evidence.map((item) => (
                  <blockquote
                    key={item.chunk_id}
                    className='border-l-2 pl-3 text-sm text-muted-foreground'
                  >
                    {item.excerpt}
                  </blockquote>
                ))}
                {insight.status === 'pending_approval' ? (
                  <Link className='text-sm underline' href='/dashboard/approvals'>
                    Review proposed action
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </PageContainer>
  );
}
