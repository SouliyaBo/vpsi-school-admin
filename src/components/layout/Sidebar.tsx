import { GraduationCap, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { useCan } from '@/features/auth/hooks';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NAV_GROUPS } from './nav-config';

interface SidebarProps {
  /** Mobile/tablet drawer state; the sidebar is always visible on desktop. */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const can = useCan();

  const schoolName =
    (i18n.language === 'en'
      ? import.meta.env.VITE_SCHOOL_NAME_EN
      : import.meta.env.VITE_SCHOOL_NAME_LO) ?? 'VPSI School';

  // Groups whose every entry is denied disappear entirely, so a teacher does not
  // see an empty "System" heading.
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(item.resource, item.action)),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      {/* Scrim, mobile only */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-foreground/10">
            <GraduationCap className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{schoolName}</p>
            <p className="truncate text-xs text-sidebar-muted-foreground">{t('common.appName')}</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-sidebar-foreground hover:bg-sidebar-active lg:hidden"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin" aria-label="Main">
          {groups.map((group, index) => (
            <div key={group.labelKey ?? index} className={cn(index > 0 && 'mt-4')}>
              {group.labelKey && (
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted-foreground">
                  {t(`nav.${group.labelKey}`)}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          'hover:bg-sidebar-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-foreground/50',
                          isActive ? 'bg-sidebar-active' : 'text-sidebar-foreground/85',
                        )
                      }
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{t(`nav.${item.labelKey}`)}</span>
                      {item.comingSoon && (
                        <span
                          className="ms-auto rounded-sm bg-sidebar-foreground/15 px-1.5 py-0.5 text-[10px] font-medium uppercase"
                          title="Planned for a later phase"
                        >
                          soon
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
