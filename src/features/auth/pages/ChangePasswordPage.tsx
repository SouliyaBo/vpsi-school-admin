import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { notify } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { authApi } from '../api';
import { AuthLayout } from '../components/AuthLayout';
import { changePasswordSchema, type ChangePasswordValues } from '../schemas';
import { useAuthStore } from '../store';

/**
 * Forced password change.
 *
 * Reached when `mustChangePassword` is set — a newly created account or an
 * admin-issued temporary password. The API revokes every session on success, so
 * the only correct next step is a fresh sign-in.
 */
export function ChangePasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: ChangePasswordValues) =>
      authApi.changePassword(values.currentPassword, values.newPassword),
    onSuccess: async () => {
      notify.success(t('auth.changePasswordDone'));
      await logout();
      navigate('/login', { replace: true });
    },
  });

  return (
    <AuthLayout title={t('auth.changePassword')}>
      {user?.mustChangePassword && (
        <p className="flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('auth.mustChangePassword')}
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
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t('auth.currentPassword')}</FormLabel>
                <FormControl>
                  <Input {...field} type="password" autoComplete="current-password" autoFocus />
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

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => void logout().then(() => navigate('/login', { replace: true }))}
            >
              {t('common.logout')}
            </Button>
            <Button type="submit" className="flex-1" loading={mutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Form>
    </AuthLayout>
  );
}
