import { vi } from 'vitest';

// antd's `Space`/`Grid` responsive hooks call `window.matchMedia`, which jsdom
// does not implement. Without this polyfill every component test that renders
// antd's responsive components crashes during the effect phase with
// "window.matchMedia is not a function" before assertions ever run.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
