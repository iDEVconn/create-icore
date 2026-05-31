import { Box, Button, Container, Typography } from '@mui/material';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export function AccessDeniedPage() {
  const { t } = useTranslation();
  return (
    <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
      <Typography variant="h2" component="div" color="error" gutterBottom>
        403
      </Typography>
      <Typography variant="h5" gutterBottom>
        {t('error.accessDenied')}
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        {t('error.unknown')}
      </Typography>
      <Box>
        <Button component={Link} to="/dashboard" variant="contained">
          Dashboard
        </Button>
      </Box>
    </Container>
  );
}
