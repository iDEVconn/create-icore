import { useTranslation } from 'react-i18next';
import type { AiUsageTimeseriesPoint } from '@idevconn/ai-usage';
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

interface AiUsageTimeseriesTableProps {
  points: AiUsageTimeseriesPoint[] | undefined;
  loading: boolean;
}

/**
 * Daily usage as a table, not a chart — no charting library is a client
 * template dependency yet. Follow-up if a chart becomes worth the added
 * bundle weight for this one page.
 */
export function AiUsageTimeseriesTable({ points, loading }: AiUsageTimeseriesTableProps) {
  const { t } = useTranslation();
  const data = points ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{t('aiUsage.table.date')}</CardTitle>
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
                <TableHead>{t('aiUsage.table.date')}</TableHead>
                <TableHead>{t('aiUsage.table.calls')}</TableHead>
                <TableHead>{t('aiUsage.table.tokens')}</TableHead>
                <TableHead>{t('aiUsage.table.cost')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((point) => (
                <TableRow key={point.date}>
                  <TableCell>{point.date}</TableCell>
                  <TableCell>{formatNumber(point.calls)}</TableCell>
                  <TableCell>
                    {formatTokens(point.input_tokens)} / {formatTokens(point.output_tokens)}
                  </TableCell>
                  <TableCell>{formatCost(point.cost_usd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
