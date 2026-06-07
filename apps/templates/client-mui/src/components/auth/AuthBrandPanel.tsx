import { Box, Stack, Typography } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

const FEATURES = [
  'Strategy-pattern auth & storage',
  'Multi-provider: password, magic link, OAuth',
  'CASL role-based access control',
];

export function AuthBrandPanel() {
  return (
    <Box
      sx={{
        flex: 1,
        background: 'linear-gradient(135deg, #0d1117 0%, #0f1e0f 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        p: '48px 56px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: '20%',
          left: '10%',
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(34,197,94,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <Stack spacing={4} sx={{ position: 'relative', zIndex: 1 }}>
        <Stack spacing={0.5}>
          <Typography variant="h4" fontWeight={700} sx={{ color: '#22c55e' }}>
            iCore
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
            Enterprise scaffold for NestJS + React
          </Typography>
        </Stack>

        <Stack spacing={1}>
          {FEATURES.map((f) => (
            <Stack key={f} direction="row" spacing={1} alignItems="center">
              <CheckCircleOutlineIcon sx={{ color: '#22c55e', fontSize: 16 }} />
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.75)' }}>
                {f}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}
