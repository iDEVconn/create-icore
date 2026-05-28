import type { ReactNode } from 'react';

export interface LandingPageDep {
  name: string;
  version: string;
  url?: string;
}

export interface LandingPageProps {
  coreVersion: string;
  uiLibrary: 'shadcn' | 'antd' | 'mui';
  deps: LandingPageDep[];
  ctaHref?: string;
  ctaLabel?: ReactNode;
}

export function LandingPage(props: LandingPageProps) {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '4rem auto',
        padding: '2rem',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        lineHeight: 1.5,
      }}
    >
      <h1 style={{ marginBottom: '0.25rem' }}>icore v{props.coreVersion}</h1>
      <p style={{ color: '#666' }}>
        Bootstrap scaffold built with <strong>{props.uiLibrary}</strong>.
      </p>

      <h2 style={{ marginTop: '2rem' }}>Installed packages</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {props.deps.map((d) => (
          <li
            key={d.name}
            style={{
              padding: '0.5rem 0',
              borderBottom: '1px solid #eee',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>
              {d.url ? (
                <a href={d.url} target="_blank" rel="noreferrer noopener">
                  {d.name}
                </a>
              ) : (
                d.name
              )}
            </span>
            <code style={{ color: '#888' }}>{d.version}</code>
          </li>
        ))}
      </ul>

      {props.ctaHref ? (
        <p style={{ marginTop: '2rem' }}>
          <a href={props.ctaHref} style={{ fontWeight: 600 }}>
            {props.ctaLabel ?? 'Continue →'}
          </a>
        </p>
      ) : null}
    </main>
  );
}
