import { afterEach, vi } from 'vitest';

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

// antd's Form.Item error list (`form/hooks/useDebounce`) schedules a 10 ms
// `setTimeout` on every mount and every error change, and never cancels it on
// unmount. When a spec file ends inside that window, Vitest tears the jsdom
// environment down first and the timer then throws
// "ReferenceError: window is not defined" from react-dom as an unhandled
// error, which fails the whole run (seen on CI, where workers are slower).
// Waiting longer than the debounce after every test lets the leaked timer
// fire while `window` still exists.
afterEach(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 25));
});
