import { createFileRoute } from '@tanstack/react-router';
import { AiUsagePage } from '@/components/ai-usage/AiUsagePage';

export const Route = createFileRoute('/_dashboard/admin/ai-usage')({
  component: AiUsagePage,
});
