import { useTranslation } from 'react-i18next';
import type { AiUsageSummary } from '@idevconn/ai-usage';
import { AiUsageBreakdownTable } from './AiUsageBreakdownTable';
import { AiUsageByUserTable } from './AiUsageByUserTable';

interface AiUsageBreakdownSectionProps {
  summary: AiUsageSummary | undefined;
  loading: boolean;
}

export function AiUsageBreakdownSection({ summary, loading }: AiUsageBreakdownSectionProps) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <AiUsageBreakdownTable
        title={t('aiUsage.breakdown.byProvider')}
        rows={summary?.by_provider}
        loading={loading}
      />
      <AiUsageBreakdownTable
        title={t('aiUsage.breakdown.byOperation')}
        rows={summary?.by_operation}
        loading={loading}
      />
      <AiUsageBreakdownTable
        title={t('aiUsage.breakdown.byKeySource')}
        rows={summary?.by_key_source}
        loading={loading}
      />
      <AiUsageByUserTable rows={summary?.by_user} loading={loading} />
    </div>
  );
}
