import { z, type ZodErrorMap } from 'zod';
import i18n from '@/i18n';

/**
 * Global, language-aware Zod error map.
 *
 * Schemas in src/lib/validation.ts carry NO hard-coded messages; every issue is
 * rendered here at parse time in the active UI language using the `validation`
 * namespace:
 *
 *   validation:fields.<fieldName>                    human label for the path's last segment
 *   validation:fieldMessages.<field>.<code>[.<validation>]  optional exact wording override
 *   validation:codes.<code>[.<variant>]              generic fallbacks with {{field}}, {{min}}, {{max}}, {{options}}
 *
 * Installed once from src/main.tsx (side-effect import).
 */

function fieldLabel(path: (string | number)[]): string {
  const last = [...path].reverse().find((p) => typeof p === 'string') as string | undefined;
  if (!last) return i18n.t('validation:fields._default');
  const key = `validation:fields.${last}`;
  if (i18n.exists(key)) return i18n.t(key);
  return last.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function override(path: (string | number)[], code: string, variant?: string): string | null {
  const last = [...path].reverse().find((p) => typeof p === 'string') as string | undefined;
  if (!last) return null;
  const candidates = variant
    ? [`validation:fieldMessages.${last}.${code}.${variant}`, `validation:fieldMessages.${last}.${code}`]
    : [`validation:fieldMessages.${last}.${code}`];
  for (const k of candidates) if (i18n.exists(k)) return i18n.t(k);
  return null;
}

export const localizedZodErrorMap: ZodErrorMap = (issue, ctx) => {
  const field = fieldLabel(issue.path);
  const t = (key: string, vars: Record<string, unknown> = {}) =>
    i18n.t(`validation:codes.${key}`, { field, ...vars });

  switch (issue.code) {
    case z.ZodIssueCode.invalid_type: {
      const isMissing = issue.received === 'undefined' || issue.received === 'null';
      return {
        message:
          override(issue.path, issue.code, isMissing ? 'required' : undefined) ??
          (isMissing ? t('required') : t('invalid_type')),
      };
    }
    case z.ZodIssueCode.too_small: {
      const kind = issue.type === 'string' ? 'string' : issue.type === 'array' ? 'array' : 'number';
      return {
        message:
          override(issue.path, issue.code) ??
          (kind === 'string' && issue.minimum === 1
            ? t('required')
            : t(`too_small.${kind}`, { min: String(issue.minimum) })),
      };
    }
    case z.ZodIssueCode.too_big: {
      const kind = issue.type === 'string' ? 'string' : issue.type === 'array' ? 'array' : 'number';
      return {
        message: override(issue.path, issue.code) ?? t(`too_big.${kind}`, { max: String(issue.maximum) }),
      };
    }
    case z.ZodIssueCode.invalid_string: {
      const validation = typeof issue.validation === 'string' ? issue.validation : 'regex';
      return {
        message:
          override(issue.path, issue.code, validation) ??
          (i18n.exists(`validation:codes.invalid_string.${validation}`)
            ? t(`invalid_string.${validation}`)
            : t('invalid_string.regex')),
      };
    }
    case z.ZodIssueCode.invalid_enum_value:
      return {
        message:
          override(issue.path, issue.code) ??
          t('invalid_enum_value', { options: issue.options.map(String).join(', ') }),
      };
    case z.ZodIssueCode.invalid_literal:
    case z.ZodIssueCode.invalid_union:
      return { message: override(issue.path, issue.code) ?? t('invalid_type') };
    default:
      return { message: override(issue.path, issue.code) ?? ctx.defaultError };
  }
};

z.setErrorMap(localizedZodErrorMap);
