import type { ReactNode } from 'react';
import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import { Can, useDraft, useLoading } from '@icore/template-shared';
import type { AbilityAction, AbilitySubject } from '@icore/shared';
import { AccessDeniedPage } from './AccessDeniedPage';

export interface PageLayoutProps {
  title: ReactNode;
  description?: ReactNode;
  /** CASL action gate. Together with subject, renders AccessDeniedPage on failure. */
  action?: AbilityAction;
  /** CASL subject gate. Together with action, renders AccessDeniedPage on failure. */
  subject?: AbilitySubject;
  extra?: ReactNode;
  children?: ReactNode;
}

export function PageLayout({
  title,
  description,
  action = 'read',
  subject = 'all',
  extra,
  children,
}: PageLayoutProps) {
  useDraft(false);
  const loading = useLoading();

  return (
    <Can I={action} a={subject} passThrough>
      {({ isAllowed }: { isAllowed: boolean }) =>
        isAllowed ? (
          <Box sx={{ p: 3 }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="flex-start"
              spacing={2}
              mb={3}
            >
              <Box>
                <Typography variant="h4" component="h1">
                  {title}
                </Typography>
                {description ? (
                  <Typography variant="body2" color="text.secondary" mt={0.5}>
                    {description}
                  </Typography>
                ) : null}
              </Box>
              {extra ? (
                <Stack direction="row" spacing={1}>
                  {extra}
                </Stack>
              ) : null}
            </Stack>
            {loading ? <LinearProgress sx={{ mb: 2 }} /> : null}
            <Box>{children}</Box>
          </Box>
        ) : (
          <AccessDeniedPage />
        )
      }
    </Can>
  );
}
