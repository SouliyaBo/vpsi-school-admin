import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Copy, KeyRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { notify } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { authApi } from '../api';
import { AuthLayout } from '../components/AuthLayout';
import { forgotPasswordSchema, type ForgotPasswordValues } from '../schemas';

export function ForgotPasswordPage() {
  const { t } = useTranslation();

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { username: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: ForgotPasswordValues) => authApi.requestPasswordReset(values.username),
  });

  return (
    <AuthLayout
      title={t('auth.forgotPasswordTitle')}
      description={t('auth.forgotPasswordHint')}
      footer={
        <Link to="/login" className="underline underline-offset-4 hover:no-underline">
          {t('auth.backToLogin')}
        </Link>
      }
    >
      {/* The endpoint answers 200 whether or not the account exists, so it cannot
          be used to enumerate usernames — the confirmation is deliberately vague. */}
      {mutation.isSuccess ? (
        <div className="space-y-3">
          <p className="rounded-md bg-success-subtle px-3 py-2 text-sm text-success">
            {t('auth.resetTokenIssued')}
          </p>

          {mutation.data?.token && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t('auth.resetToken')}</p>
              <div className="flex gap-2">
                <Input readOnly value={mutation.data.token} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t('toast.copied')}
                  onClick={() => {
                    void navigator.clipboard.writeText(mutation.data!.token!);
                    notify.success(t('toast.copied'));
                  }}
                >
                  <Copy />
                </Button>
              </div>
            </div>
          )}

          <Button asChild className="w-full">
            <Link to="/reset-password">
              <KeyRound />
              {t('auth.resetTitle')}
            </Link>
          </Button>
        </div>
      ) : (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t('auth.username')}</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="username" autoFocus autoCapitalize="none" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" loading={mutation.isPending}>
              {t('auth.requestReset')}
            </Button>
          </form>
        </Form>
      )}
    </AuthLayout>
  );
}
