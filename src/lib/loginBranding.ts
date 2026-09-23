import type { CSSProperties } from 'react';

/**
 * Default hero for split login screens (client portal + staff /auth).
 * Override with `VITE_LOGIN_HERO_URL` in `.env` (absolute URL to a wide
 * spa / interior image, ~1600×1000 or larger).
 */
export const DEFAULT_LOGIN_HERO_URL =
  'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1600&q=82';

const envHero =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_LOGIN_HERO_URL
    ? String(import.meta.env.VITE_LOGIN_HERO_URL).trim()
    : '';

export const LOGIN_HERO_URL = envHero || DEFAULT_LOGIN_HERO_URL;

/** Per-org login screen customization, stored at `organizations/{orgId}.login_branding`. */
export interface LoginBranding {
  hero_url: string | null;
  hero_storage_path: string | null;
  title: string | null;
  subtitle: string | null;
  accent: string | null;
}

export const EMPTY_LOGIN_BRANDING: LoginBranding = {
  hero_url: null,
  hero_storage_path: null,
  title: null,
  subtitle: null,
  accent: null,
};

export const LOGIN_BRANDING_TITLE_MAX = 80;
export const LOGIN_BRANDING_SUBTITLE_MAX = 200;
export const LOGIN_HERO_MAX_BYTES = 5 * 1024 * 1024;

const PLATFORM_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  'beautyhubpro.com',
  'www.beautyhubpro.com',
  'app.beautyhubpro.com',
]);

/**
 * True when the app is served from a tenant's own domain (e.g. `crm.lumiereut.com`),
 * where the login screens must carry that tenant's branding instead of BeautyHub's.
 */
export function isWhiteLabelHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/:\d+$/, '');
  if (!host) return false;
  return !PLATFORM_HOSTS.has(host);
}

export function normalizeHexColor(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${raw
      .split('')
      .map((c) => c + c)
      .join('')}`;
  }
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  return null;
}

/** Picks the text color with the higher WCAG contrast ratio against `hex`. */
export function readableTextOn(hex: string): '#ffffff' | '#1a1a1a' {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return '#ffffff';
  const channel = (offset: number) => {
    const c = parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.179 ? '#1a1a1a' : '#ffffff';
}

export function accentButtonStyle(accent: string | null | undefined): CSSProperties | undefined {
  const color = normalizeHexColor(accent);
  if (!color) return undefined;
  return { backgroundColor: color, borderColor: color, color: readableTextOn(color) };
}

const trimmedOrNull = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

const imageUrlOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^https?:\/\/[^\s"'()\\]+$/i.test(trimmed) ? trimmed : null;
};

/** Coerces raw Firestore / callable data into a well-formed `LoginBranding`, dropping anything unsafe. */
export function sanitizeLoginBranding(raw: unknown): LoginBranding {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_LOGIN_BRANDING };
  const data = raw as Record<string, unknown>;
  return {
    hero_url: imageUrlOrNull(data.hero_url),
    hero_storage_path: trimmedOrNull(data.hero_storage_path, 512),
    title: trimmedOrNull(data.title, LOGIN_BRANDING_TITLE_MAX),
    subtitle: trimmedOrNull(data.subtitle, LOGIN_BRANDING_SUBTITLE_MAX),
    accent: normalizeHexColor(typeof data.accent === 'string' ? data.accent : null),
  };
}

export function hasCustomLoginBranding(branding: LoginBranding | null | undefined): boolean {
  if (!branding) return false;
  return Boolean(branding.hero_url || branding.title || branding.subtitle || branding.accent);
}

export function heroBackgroundImage(heroUrl: string): string {
  return `linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.28) 40%, rgba(0,0,0,0.55) 100%), url("${heroUrl}")`;
}
