import { Box, Typography } from '@mui/material';

export function LayoutFooter() {
  const year = new Date().getFullYear();
  return (
    <Box
      component="footer"
      sx={{
        py: 2,
        textAlign: 'center',
        borderTop: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Typography variant="body2" color="text.secondary">
        &copy; iCore {year}
      </Typography>
    </Box>
  );
}
