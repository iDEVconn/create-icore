import i18next, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';

const STORAGE_KEY = 'icore-lang';

export type IcoreLocale = 'en' | 'ru' | 'he';
const RTL_LOCALES: ReadonlySet<IcoreLocale> = new Set(['he']);

export function getStoredLocale(fallback: IcoreLocale = 'en'): IcoreLocale {
  if (typeof window === 'undefined') return fallback;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'en' || v === 'ru' || v === 'he' ? v : fallback;
}

export function setStoredLocale(loc: IcoreLocale): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, loc);
  document.documentElement.dir = RTL_LOCALES.has(loc) ? 'rtl' : 'ltr';
  document.documentElement.lang = loc;
}

export interface CreateIcoreI18nOpts {
  resources: Resource;
  defaultLocale?: IcoreLocale;
}

export function createIcoreI18n(opts: CreateIcoreI18nOpts) {
  const lng = getStoredLocale(opts.defaultLocale ?? 'en');
  void i18next.use(initReactI18next).init({
    resources: opts.resources,
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
  if (typeof document !== 'undefined') {
    document.documentElement.dir = RTL_LOCALES.has(lng) ? 'rtl' : 'ltr';
    document.documentElement.lang = lng;
  }
  return i18next;
}

export { i18next };
