import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { notify } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { authApi } from '../api';
import { AuthLayout } from '../components/AuthLayout';
import { resetPasswordSchema, type ResetPasswordValues } from '../schemas';

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    // Support a token handed over as a link, as well as pasted by hand.
    defaultValues: { token: searchParams.get('token') ?? '', newPassword: '', confirmPassword: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: ResetPasswordValues) =>
      authApi.resetPassword(values.token, values.newPassword),
    onSuccess: () => {
      notify.success(t('auth.resetDone'));
      navigate('/login', { replace: true });
    },
  });

  return (
    <AuthLayout
      title={t('auth.resetTitle')}
      footer={
        <Link to="/login" className="underline underline-offset-4 hover:no-underline">
          {t('auth.backToLogin')}
        </Link>
      }
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="token"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t('auth.resetToken')}</FormLabel>
                <FormControl>
                  <Input {...field} className="font-mono text-xs" autoFocus />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t('auth.newPassword')}</FormLabel>
                <FormControl>
                  <Input {...field} type="password" autoComplete="new-password" />
                </FormControl>
                <FormDescription>{t('auth.passwordRule')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t('auth.confirmPassword')}</FormLabel>
                <FormControl>
                  <Input {...field} type="password" autoComplete="new-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
