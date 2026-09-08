import { useTranslation } from 'react-i18next';
import type { AiUsageSummary } from '@idevconn/ai-usage';
import { formatCost, formatNumber, formatTokens } from '@idevconn/ai-usage/react';
import { AiUsageStatCard } from './AiUsageStatCard';

interface AiUsageStatCardsProps {
  summary: AiUsageSummary | undefined;
  loading: boolean;
}

export function AiUsageStatCards({ summary, loading }: AiUsageStatCardsProps) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <AiUsageStatCard
        label={t('aiUsage.stat.totalCalls')}
        loading={loading}
        value={formatNumber(summary?.total_calls)}
      />
      <AiUsageStatCard
        label={t('aiUsage.stat.tokens')}
        loading={loading}
        value={`${formatTokens(summary?.total_input_tokens)} / ${formatTokens(summary?.total_output_tokens)}`}
      />
      <AiUsageStatCard
        label={t('aiUsage.stat.successRate')}
        loading={loading}
        value={`${formatNumber(summary?.success_count)} / ${formatNumber(summary?.error_count)}`}
      />
      <AiUsageStatCard
        label={t('aiUsage.stat.totalCost')}
        loading={loading}
        value={formatCost(summary?.total_cost_usd)}
      />
    </div>
  );
}
