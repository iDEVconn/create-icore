import { Button, Stack, Typography } from '@mui/material';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import { useTranslation } from 'react-i18next';

interface Props {
  email: string;
  onBack: () => void;
}

export function CheckEmailScreen({ email, onBack }: Props) {
  const { t } = useTranslation();
  return (
    <Stack spacing={3} alignItems="center" textAlign="center">
      <MarkEmailReadOutlinedIcon sx={{ fontSize: 56, color: 'primary.main' }} />
      <Stack spacing={1}>
        <Typography variant="h5" fontWeight={600}>
          {t('auth.checkEmail')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('auth.checkEmailDescription', { email })}
        </Typography>
      </Stack>
      <Button variant="outlined" fullWidth onClick={onBack}>
        {t('auth.backToLogin')}
      </Button>
    </Stack>
  );
}
