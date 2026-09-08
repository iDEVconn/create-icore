import { useTranslation } from 'react-i18next';
import type { AiUsageByUserRow } from '@idevconn/ai-usage';
import { formatCost, formatNumber, formatTokens } from '@idevconn/ai-usage/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface AiUsageByUserTableProps {
  rows: AiUsageByUserRow[] | undefined;
  loading: boolean;
}

export function AiUsageByUserTable({ rows, loading }: AiUsageByUserTableProps) {
  const { t } = useTranslation();
  const data = rows ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{t('aiUsage.breakdown.byUser')}</CardTitle>
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
                <TableHead>{t('aiUsage.table.user')}</TableHead>
                <TableHead>{t('aiUsage.table.calls')}</TableHead>
                <TableHead>{t('aiUsage.table.tokens')}</TableHead>
                <TableHead>{t('aiUsage.table.cost')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.user_id}>
                  <TableCell>{row.email ?? row.user_id}</TableCell>
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
