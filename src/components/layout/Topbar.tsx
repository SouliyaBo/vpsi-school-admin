import { KeyRound, LogOut, Menu, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LocaleSwitcher } from './LocaleSwitcher';
import { NotificationBell } from './NotificationBell';
import { findNavItem } from './nav-config';

export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const logout = useAuthStore((state) => state.logout);

  const current = findNavItem(location.pathname);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
      >
        <Menu />
      </Button>

      {/* Breadcrumb — one level is enough here: the sidebar already shows the
          group, and detail pages carry their own heading. */}
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-sm">
          <li className="text-muted-foreground">
            <Link to="/" className="hover:text-foreground">
              {t('nav.dashboard')}
            </Link>
          </li>
          {current && current.to !== '/' && (
            <>
              <li aria-hidden className="text-muted-foreground">
                /
              </li>
              <li className="truncate font-medium">{t(`nav.${current.labelKey}`)}</li>
            </>
          )}
        </ol>
      </nav>

      <LocaleSwitcher />
      <NotificationBell />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 px-1.5">
            <Avatar className="size-7">
              <AvatarFallback>{user?.username.slice(0, 2).toUpperCase() ?? '?'}</AvatarFallback>
            </Avatar>
            <span className="hidden text-sm font-medium sm:inline">{user?.username}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-sm font-normal">
            <p className="font-medium text-foreground">{user?.username}</p>
            <p className="text-xs text-muted-foreground">{user?.roleCode}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate('/profile')}>
            <User />
            {t('common.profile')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate('/change-password')}>
            <KeyRound />
            {t('auth.changePassword')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            destructive
            onSelect={() => void logout().then(() => navigate('/login', { replace: true }))}
          >
            <LogOut />
            {t('common.logout')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
