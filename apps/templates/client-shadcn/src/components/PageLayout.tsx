import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Can, useDraft, useLoading } from '@icore/template-shared';
import type { AbilityAction, AbilitySubject } from '@icore/shared';
import { AccessDeniedPage } from './AccessDeniedPage';

interface PageLayoutProps {
  title: string;
  description?: string;
  /** CASL action gate. When provided together with `subject`, renders AccessDeniedPage if the ability check fails. */
  action?: AbilityAction;
  /** CASL subject gate. When provided together with `action`, renders AccessDeniedPage if the ability check fails. */
  subject?: AbilitySubject;
  children: ReactNode;
}

export function PageLayout({ title, description, action, subject, children }: PageLayoutProps) {
  const { t } = useTranslation();
  const isLoading = useLoading();

  // Reset global draft state on mount/unmount so navigation is never blocked on a fresh page.
  useDraft(false);

  const content = (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>

      {isLoading && (
        <div
          role="status"
          aria-label={t('common.loading')}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {children}
    </div>
  );

  // When both action and subject are provided, gate the content with a CASL ability check.
  if (action && subject) {
    return (
      <Can I={action} a={subject as Exclude<AbilitySubject, 'all'>} passThrough>
        {({ isAllowed }: { isAllowed: boolean }) => (isAllowed ? content : <AccessDeniedPage />)}
      </Can>
    );
  }

  return content;
}
