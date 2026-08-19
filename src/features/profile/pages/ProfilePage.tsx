import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { authApi } from '@/features/auth/api';
import { useCurrentUser } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { changeLocale } from '@/i18n';
import { stripEmpty } from '@/lib/payload';
import { notify } from '@/lib/toast';
import { optionalEmail } from '@/lib/zod-helpers';
import { LOCALES, type Locale } from '@/types/enums';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { DetailRow, DetailSection } from '@/components/common/DetailDrawer';
import { FieldSection, SelectField, TextField } from '@/components/common/fields';
import { PageHeader } from '@/components/common/PageHeader';

const schema = z.object({
  email: optionalEmail(),
  locale: z.enum(LOCALES),
});

type FormValues = z.infer<typeof schema>;

/**
 * The signed-in user's own account.
 *
 * `PATCH /users/me` is the only self-service write available — everything else
 * about an account (role, status, person link) is an administrator action.
 */
export function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const logout = useAuthStore((state) => state.logout);
  const refreshUser = useAuthStore((state) => state.refreshUser);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', locale: 'lo' },
  });

  useEffect(() => {
    if (!user) return;
    form.reset({ email: '', locale: (user.locale as Locale) === 'en' ? 'en' : 'lo' });
  }, [user, form]);

  const save = useMutation({
    mutationFn: (values: FormValues) => authApi.updateMyProfile(stripEmpty(values)),
    onSuccess: async (_data, values) => {
      notify.success(t('toast.updated'));
      // Keep the UI language in step with the stored preference.
      changeLocale(values.locale);
      await refreshUser();
    },
  });

  const logoutEverywhere = useMutation({
    mutationFn: () => logout({ everywhere: true }),
    onSuccess: () => navigate('/login', { replace: true }),
  });

  if (!user) return null;

  return (
    <div className="space-y-4">
      <PageHeader title={t('common.profile')} description={user.username} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('common.profile')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <DetailSection title={t('person.basicInfo')}>
              <DetailRow label={t('auth.username')}>{user.username}</DetailRow>
              <DetailRow label={t('nav.roles')}>
                <Badge variant="outline">{user.roleCode}</Badge>
              </DetailRow>
              <DetailRow label={t('nav.people')}>{user.personType}</DetailRow>
            </DetailSection>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((values) => save.mutate(values))}
                className="space-y-4"
                noValidate
              >
                <FieldSection columns={1}>
                  <TextField
                    control={form.control}
                    name="email"
                    label={t('person.email')}
                    type="email"
                    placeholder="name@school.local"
                  />
                  <SelectField
                    control={form.control}
                    name="locale"
                    label={t('common.language')}
                    required
                    options={LOCALES.map((locale) => ({
                      value: locale,
                      label: locale === 'lo' ? 'ລາວ' : 'English',
                    }))}
                  />
                </FieldSection>
                <Button type="submit" loading={save.isPending}>
                  {t('common.save')}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('auth.changePassword')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('auth.passwordRule')}</p>
              <Button variant="outline" asChild>
                <Link to="/change-password">
                  <KeyRound />
                  {t('auth.changePassword')}
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4" aria-hidden />
                {t('nav.roles')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* The resolved matrix, exactly as the API reports it — useful when
                  someone asks why a menu entry is missing. */}
              <div className="max-h-64 space-y-1.5 overflow-y-auto scrollbar-thin">
                {user.permissions.map((permission) => (
                  <div
                    key={permission.resource}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5 text-sm last:border-0"
                  >
                    <span className="font-medium">{permission.resource}</span>
                    <span className="flex flex-wrap gap-1">
                      {permission.actions.map((action) => (
                        <Badge key={action} variant="secondary" className="text-[10px]">
                          {action}
                        </Badge>
                      ))}
                    </span>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                className="text-danger"
                loading={logoutEverywhere.isPending}
                onClick={() => logoutEverywhere.mutate()}
              >
                <LogOut />
                {t('auth.logoutAll')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
