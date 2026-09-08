import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiUsageRange } from '@idevconn/ai-usage';
import { useAiUsageSummary, useAiUsageTimeseries } from '@idevconn/ai-usage/react';
import { PageLayout } from '@/components/PageLayout';
import { api } from '@/main';
import { AiUsageRangePicker } from './AiUsageRangePicker';
import { AiUsageStatCards } from './AiUsageStatCards';
import { AiUsageBreakdownSection } from './AiUsageBreakdownSection';
import { AiUsageTimeseriesTable } from './AiUsageTimeseriesTable';

export function AiUsagePage() {
  const { t } = useTranslation();
  const [range, setRange] = useState<AiUsageRange>('7d');

  // No userId filter — the admin dashboard shows usage across every user.
  const summary = useAiUsageSummary(range, undefined, { fetchFn: api });
  const timeseries = useAiUsageTimeseries(range, undefined, { fetchFn: api });

  return (
    <PageLayout
      title={t('aiUsage.title')}
      description={t('aiUsage.hint')}
      action="read"
      subject="AiUsage"
      actions={<AiUsageRangePicker value={range} onChange={setRange} />}
    >
      <div className="space-y-4">
        <AiUsageStatCards summary={summary.data} loading={summary.isPending} />
        <AiUsageBreakdownSection summary={summary.data} loading={summary.isPending} />
        <AiUsageTimeseriesTable points={timeseries.data?.points} loading={timeseries.isPending} />
      </div>
    </PageLayout>
  );
}
