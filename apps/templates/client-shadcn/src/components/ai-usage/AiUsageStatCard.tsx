import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AiUsageStatCardProps {
  label: string;
  loading: boolean;
  value: string;
}

export function AiUsageStatCard({ label, loading, value }: AiUsageStatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{loading ? '—' : value}</p>
      </CardContent>
    </Card>
  );
}
