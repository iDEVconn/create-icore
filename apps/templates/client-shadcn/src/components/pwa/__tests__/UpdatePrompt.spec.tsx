import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

const registerSW = vi.fn();
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => registerSW(),
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn() }),
}));

describe('UpdatePrompt', () => {
  it('shows an offline-ready toast once the SW reports offlineReady', async () => {
    registerSW.mockReturnValue({
      offlineReady: [true, vi.fn()],
      needRefresh: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });
    const { UpdatePrompt } = await import('../UpdatePrompt');
    render(<UpdatePrompt />);
    expect(toast.success).toHaveBeenCalledWith('Ready to work offline');
  });

  it('shows a reload prompt once the SW reports needRefresh', async () => {
    const updateServiceWorker = vi.fn();
    registerSW.mockReturnValue({
      offlineReady: [false, vi.fn()],
      needRefresh: [true, vi.fn()],
      updateServiceWorker,
    });
    const { UpdatePrompt } = await import('../UpdatePrompt');
    render(<UpdatePrompt />);
    expect(toast).toHaveBeenCalledWith(
      'New version available',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Reload' }) }),
    );
  });
});
