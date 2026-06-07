import { ShieldCheck, Zap, Globe } from 'lucide-react';

const FEATURES = [
  { icon: ShieldCheck, text: 'Auth, storage & payments — wired out of the box' },
  { icon: Zap, text: 'Strategy pattern — swap any provider via env' },
  { icon: Globe, text: 'Multi-language, dark mode, CASL authorization' },
];

export function AuthBrandPanel() {
  return (
    <div className="relative hidden lg:flex lg:w-2/5 flex-col justify-between p-12 bg-[--color-card] overflow-hidden">
      {/* Green ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[--color-primary]/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full bg-[--color-primary]/5 blur-2xl"
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-12">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[--color-primary]">
            <span className="text-sm font-bold text-[--color-primary-foreground]">i</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">iCore</span>
        </div>

        <h2 className="text-3xl font-bold leading-tight mb-4">
          Enterprise-grade
          <br />
          <span className="text-[--color-primary]">full-stack scaffold</span>
        </h2>
        <p className="text-[--color-muted-foreground] text-sm leading-relaxed max-w-xs">
          Nx monorepo · NestJS microservices · React 19. Production-ready from day one.
        </p>
      </div>

      <ul className="relative z-10 space-y-4">
        {FEATURES.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[--color-primary]/15">
              <Icon size={11} className="text-[--color-primary]" />
            </div>
            <span className="text-sm text-[--color-muted-foreground]">{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
