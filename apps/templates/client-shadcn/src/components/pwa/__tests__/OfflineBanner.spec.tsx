import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OfflineBanner } from '../OfflineBanner';

describe('OfflineBanner', () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');

  function setOnline(value: boolean) {
    Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
  }

  afterEach(() => {
    if (originalOnLine) Object.defineProperty(window.navigator, 'onLine', originalOnLine);
  });

  beforeEach(() => {
    setOnline(true);
  });

  it('renders nothing while online', () => {
    render(<OfflineBanner />);
    expect(screen.queryByText(/you are offline/i)).toBeNull();
  });

  it('shows the banner once the offline event fires', () => {
    render(<OfflineBanner />);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.queryByText(/you are offline/i)).not.toBeNull();
  });

  it('hides the banner again once the online event fires', () => {
    render(<OfflineBanner />);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText(/you are offline/i)).toBeNull();
  });
});
