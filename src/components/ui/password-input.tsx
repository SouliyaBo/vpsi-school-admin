import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Input } from './input';

/**
 * A password field with an eye button that reveals what was typed. Props land
 * on the <input> itself, so `FormControl` still wires its id and aria-* there.
 */
const PasswordInput = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<'input'>, 'type'>>(
  ({ className, disabled, ...props }, ref) => {
    const { t } = useTranslation();
    const [visible, setVisible] = React.useState(false);
    const label = visible ? t('auth.hidePassword') : t('auth.showPassword');

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          type={visible ? 'text' : 'password'}
          disabled={disabled}
          className={cn('pr-10', className)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={label}
          aria-pressed={visible}
          title={label}
          className={cn(
            'absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-muted-foreground',
            'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
