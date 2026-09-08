import { useTranslation } from 'react-i18next';
import type { AiUsageBreakdownRow } from '@idevconn/ai-usage';
import { formatCost, formatNumber, formatTokens } from '@idevconn/ai-usage/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AiUsageBreakdownTableProps {
  title: string;
  rows: AiUsageBreakdownRow[] | undefined;
  loading: boolean;
}

/**
 * Renders one of `AiUsageSummary`'s by_provider/by_operation/by_key_source
 * breakdowns. Named to match the package's own headless `AiUsageBreakdownTable`
 * export it wraps, but this one is the actual rendered shadcn table.
 */
export function AiUsageBreakdownTable({ title, rows, loading }: AiUsageBreakdownTableProps) {
  const { t } = useTranslation();
  const data = rows ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('aiUsage.empty')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('aiUsage.table.key')}</TableHead>
                <TableHead>{t('aiUsage.table.calls')}</TableHead>
                <TableHead>{t('aiUsage.table.tokens')}</TableHead>
                <TableHead>{t('aiUsage.table.cost')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{row.key}</TableCell>
                  <TableCell>{formatNumber(row.calls)}</TableCell>
                  <TableCell>
                    {formatTokens(row.input_tokens)} / {formatTokens(row.output_tokens)}
                  </TableCell>
                  <TableCell>{formatCost(row.total_cost_usd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
