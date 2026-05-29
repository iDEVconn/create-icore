import type { ReactNode } from 'react';
import { Descriptions, Spin } from 'antd';
import { Can, useDraft, useLoading } from '@icore/template-shared';
import type { AbilityAction, AbilitySubject } from '@icore/shared';
import { AccessDeniedPage } from './AccessDeniedPage';

export interface PageLayoutProps {
  title: ReactNode;
  description?: ReactNode;
  /** CASL action gate. When provided together with subject, renders AccessDeniedPage if the ability check fails. */
  action?: AbilityAction;
  /** CASL subject gate. When provided together with action, renders AccessDeniedPage if the ability check fails. */
  subject?: AbilitySubject;
  extra?: ReactNode;
  children?: ReactNode;
}

export function PageLayout({
  title,
  description,
  action,
  subject,
  extra,
  children,
}: PageLayoutProps) {
  useDraft(false);
  const loading = useLoading();

  const content = (
    <div style={{ padding: 24 }}>
      <Descriptions title={title} extra={extra} style={{ marginBottom: 16 }}>
        {description ? <Descriptions.Item>{description}</Descriptions.Item> : null}
      </Descriptions>
      <Spin spinning={loading}>
        <div>{children}</div>
      </Spin>
    </div>
  );

  if (action && subject) {
    return (
      <Can I={action} a={subject as Exclude<AbilitySubject, 'all'>} passThrough>
        {({ isAllowed }: { isAllowed: boolean }) => (isAllowed ? content : <AccessDeniedPage />)}
      </Can>
    );
  }

  return content;
}
