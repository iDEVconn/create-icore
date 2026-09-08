import { useTranslation } from 'react-i18next';
import { VALID_AI_USAGE_RANGES, type AiUsageRange } from '@idevconn/ai-usage';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AiUsageRangePickerProps {
  value: AiUsageRange;
  onChange: (range: AiUsageRange) => void;
}

export function AiUsageRangePicker({ value, onChange }: AiUsageRangePickerProps) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="cursor-pointer">
          {t(`aiUsage.range.${value}`)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {VALID_AI_USAGE_RANGES.map((range) => (
          <DropdownMenuItem key={range} onSelect={() => onChange(range)} className="cursor-pointer">
            {t(`aiUsage.range.${range}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
