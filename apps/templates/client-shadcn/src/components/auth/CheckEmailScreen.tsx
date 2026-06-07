import { MailCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';

interface CheckEmailScreenProps {
  email: string;
  onBack: () => void;
}

export function CheckEmailScreen({ email, onBack }: CheckEmailScreenProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center text-center space-y-4 py-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[--color-primary]/15">
        <MailCheck size={24} className="text-[--color-primary]" />
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{t('auth.checkEmail')}</h3>
        <p className="text-sm text-[--color-muted-foreground] max-w-xs">
          {t('auth.checkEmailDescription', { email })}
        </p>
      </div>
      <Button type="button" variant="outline" className="w-full cursor-pointer" onClick={onBack}>
        {t('auth.backToLogin')}
      </Button>
    </div>
  );
}
