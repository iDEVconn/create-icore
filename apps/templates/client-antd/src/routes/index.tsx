import { createFileRoute, Link } from '@tanstack/react-router';
import { LandingPage } from '@icore/template-shared';

// All version strings are injected at build time by vite.config.mts
// (reads root package.json via fs.readFileSync so they stay accurate
// even when workspace packages are bumped independently).
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.0.0-dev';

export const Route = createFileRoute('/')({
  component: () => (
    <LandingPage
      coreVersion={APP_VERSION}
      uiLibrary="antd"
      deps={[
        { name: 'react', version: (import.meta.env.VITE_DEP_REACT as string) ?? '?' },
        { name: 'antd', version: (import.meta.env.VITE_DEP_ANTD as string) ?? '?' },
        { name: 'vite', version: (import.meta.env.VITE_DEP_VITE as string) ?? '?' },
        {
          name: '@tanstack/react-router',
          version: (import.meta.env.VITE_DEP_TANSTACK_ROUTER as string) ?? '?',
        },
        {
          name: '@tanstack/react-query',
          version: (import.meta.env.VITE_DEP_TANSTACK_QUERY as string) ?? '?',
        },
        { name: 'zustand', version: (import.meta.env.VITE_DEP_ZUSTAND as string) ?? '?' },
        { name: '@casl/ability', version: (import.meta.env.VITE_DEP_CASL as string) ?? '?' },
      ]}
      ctaHref="/login"
      ctaLabel={<Link to="/login">Log in →</Link>}
    />
  ),
});
