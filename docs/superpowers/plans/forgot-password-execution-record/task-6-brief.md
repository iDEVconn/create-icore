### Task 6: Capability flag + generator + shared client helpers

**Files:**

- Modify: `apps/templates/client-{shadcn,antd,mui}/.env.example` (add `VITE_AUTH_HAS_PASSWORD_RESET=false` under the other flags)
- Modify: `Dockerfile.client` (ARG + ENV)
- Modify: `tools/create-icore/src/lib/scaffold-env.ts` (`writeClientEnv`)
- Modify: `tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts` (extend fixtures/cases)
- Create: `libs/template-shared/src/lib/auth/reset-token.ts` + `__tests__/reset-token.unit.test.ts`; export from `libs/template-shared/src/index.ts`
- Modify: `libs/template-shared/src/lib/i18n/keys.ts` (new strings, en/ru/he)

**Interfaces:**

- Produces: `resolveResetToken(params: URLSearchParams): string | null` from `@icore/template-shared` (reads `token`, then `token_hash`, then `oobCode`); i18n keys under `auth.`: `forgotPassword`, `forgotPasswordTitle`, `forgotPasswordSubtitle`, `sendResetLink`, `forgotPasswordSent`, `forgotPasswordSentDescription`, `resetPasswordTitle`, `resetPasswordSubtitle`, `newPassword`, `resetPasswordSubmit`, `resetPasswordInvalidToken`, `passwordTooShort`; env flag `VITE_AUTH_HAS_PASSWORD_RESET`.

- [ ] **Step 1: Write the failing tests.** `reset-token.unit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveResetToken } from '../reset-token';

describe('resolveResetToken', () => {
  it('reads Supabase token_hash', () => {
    expect(resolveResetToken(new URLSearchParams('token_hash=abc&type=recovery'))).toBe('abc');
  });
  it('reads a generic token param first', () => {
    expect(resolveResetToken(new URLSearchParams('token=t1&token_hash=t2'))).toBe('t1');
  });
  it('reads Firebase oobCode', () => {
    expect(resolveResetToken(new URLSearchParams('mode=resetPassword&oobCode=xyz'))).toBe('xyz');
  });
  it('returns null when none is present', () => {
    expect(resolveResetToken(new URLSearchParams('foo=bar'))).toBeNull();
  });
});
```

In `scaffold-env.unit.test.ts` extend the `fixture()` `.env.example` with `VITE_AUTH_HAS_PASSWORD_RESET=false` and add cases mirroring the existing OAuth/magic-link ones: `true` for supabase and firebase, `false` for postgres and mongodb, exactly one assignment line (use the file's `countAssignments`).

- [ ] **Step 2: Run to verify it fails** — `yarn nx test template-shared -- reset-token`; `yarn nx test create-icore --testFile=scaffold-env`. Expected: FAIL.

- [ ] **Step 3: Implement.** `reset-token.ts`:

```ts
/** Token out of a reset-email landing URL: generic `token`, Supabase `token_hash`, or Firebase `oobCode`. */
export function resolveResetToken(params: URLSearchParams): string | null {
  return params.get('token') ?? params.get('token_hash') ?? params.get('oobCode') ?? null;
}
```

export it (`export * from './lib/auth/reset-token.js';`). `writeClientEnv`: add

```ts
      .replace(
        /^VITE_AUTH_HAS_PASSWORD_RESET=.*$/m,
        `VITE_AUTH_HAS_PASSWORD_RESET=${supported}`,
      );
```

to the existing replace chain (`supported` already means supabase|firebase). `Dockerfile.client`: next to the other two lines add `ARG VITE_AUTH_HAS_PASSWORD_RESET=false` and `ENV VITE_AUTH_HAS_PASSWORD_RESET=${VITE_AUTH_HAS_PASSWORD_RESET}`; append `VITE_AUTH_HAS_PASSWORD_RESET=false` after `VITE_AUTH_HAS_MAGIC_LINK=false` in the three `.env.example`. i18n (add after each language's `emailNotConfirmed`):

en: `forgotPassword: 'Forgot password?'`, `forgotPasswordTitle: 'Reset your password'`, `forgotPasswordSubtitle: "Enter your email and we'll send you a reset link."`, `sendResetLink: 'Send reset link'`, `forgotPasswordSent: 'Check your inbox'`, `forgotPasswordSentDescription: 'If an account exists for {{email}}, we sent a link to reset the password.'`, `resetPasswordTitle: 'Choose a new password'`, `resetPasswordSubtitle: 'Use at least 8 characters.'`, `newPassword: 'New password'`, `resetPasswordSubmit: 'Set new password'`, `resetPasswordInvalidToken: 'This reset link is invalid or has expired. Request a new one.'`, `passwordTooShort: 'Password must be at least 8 characters'`.
ru: `'Забыли пароль?'`, `'Сброс пароля'`, `'Введите email — мы отправим ссылку для сброса.'`, `'Отправить ссылку'`, `'Проверьте почту'`, `'Если аккаунт для {{email}} существует, мы отправили ссылку для сброса пароля.'`, `'Выберите новый пароль'`, `'Не менее 8 символов.'`, `'Новый пароль'`, `'Задать новый пароль'`, `'Ссылка недействительна или устарела. Запросите новую.'`, `'Пароль должен быть не короче 8 символов'`.
he: `'שכחת סיסמה?'`, `'איפוס סיסמה'`, `'הזן את האימייל ונשלח לך קישור לאיפוס.'`, `'שלח קישור'`, `'בדוק את תיבת הדואר'`, `'אם קיים חשבון עבור {{email}}, שלחנו קישור לאיפוס הסיסמה.'`, `'בחר סיסמה חדשה'`, `'לפחות 8 תווים.'`, `'סיסמה חדשה'`, `'הגדר סיסמה חדשה'`, `'הקישור אינו תקף או שפג תוקפו. בקש קישור חדש.'`, `'הסיסמה חייבת להכיל לפחות 8 תווים'`.

- [ ] **Step 4: Verify** — `yarn nx run-many -t test lint -p template-shared create-icore` green; `git grep -n VITE_AUTH_HAS_PASSWORD_RESET` shows `.env.example` ×3, `Dockerfile.client`, `scaffold-env.ts`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write libs/template-shared tools/create-icore/src/lib
git checkout -- tools/create-icore/templates tools/create-icore/migrations/registry.json 2>/dev/null
git add libs/template-shared tools/create-icore/src apps/templates/*/.env.example Dockerfile.client
git commit -m "feat: VITE_AUTH_HAS_PASSWORD_RESET flag, resolveResetToken helper, reset i18n strings"
```

---
