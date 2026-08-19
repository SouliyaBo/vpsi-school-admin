import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '@/lib/error-message';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { AuthLayout } from '../components/AuthLayout';
import { loginSchema, type LoginValues } from '../schemas';
import { useAuthStore } from '../store';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);
  const expired = useAuthStore((state) => state.expired);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  // Where to land after signing in: back to the page that bounced the user, or
  // the dashboard, which itself redirects by role.
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  const mutation = useMutation({
    mutationFn: (values: LoginValues) => login(values.username, values.password),
    meta: { silentError: true },
    onSuccess: (user) => {
      // A temporary password must be replaced before anything else is reachable.
      navigate(user.mustChangePassword ? '/change-password' : redirectTo, { replace: true });
    },
  });

  useEffect(() => {
    if (expired) form.setFocus('username');
  }, [expired, form]);

  return (
    <AuthLayout
      title={t('auth.loginTitle')}
      description={t('auth.loginSubtitle')}
      footer={
        <Link to="/forgot-password" className="underline underline-offset-4 hover:no-underline">
          {t('auth.forgotPassword')}
        </Link>
      }
    >
      {expired && !mutation.isPending && (
        <p className="flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('auth.sessionExpired')}
        </p>
      )}

      {mutation.isError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {errorMessage(mutation.error)}
        </p>
      )}

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

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t('auth.password')}</FormLabel>
                <FormControl>
                  <Input {...field} type="password" autoComplete="current-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" loading={mutation.isPending}>
            {mutation.isPending ? t('auth.loggingIn') : t('auth.login')}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
