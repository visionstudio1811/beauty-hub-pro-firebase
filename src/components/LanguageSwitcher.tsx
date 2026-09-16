import { Languages } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageProvider';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type AppLanguage } from '@/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  /** compact: icon-only trigger. full: icon + current language label. */
  variant?: 'compact' | 'full';
  /** Pass false on client-facing pages so the choice is not written to users/{uid}. */
  persist?: boolean;
  className?: string;
}

export function LanguageSwitcher({ variant = 'compact', persist = true, className }: LanguageSwitcherProps) {
  const { language, setLanguage } = useLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={variant === 'compact' ? 'icon' : 'sm'}
          className={cn('gap-2', className)}
          aria-label={LANGUAGE_LABELS[language]}
        >
          <Languages className="h-4 w-4" />
          {variant === 'full' && <span>{LANGUAGE_LABELS[language]}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LANGUAGES.map((lang: AppLanguage) => (
          <DropdownMenuItem
            key={lang}
            onSelect={() => void setLanguage(lang, { persist })}
            className={cn(lang === language && 'font-semibold')}
            lang={lang}
          >
            {LANGUAGE_LABELS[lang]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default LanguageSwitcher;
