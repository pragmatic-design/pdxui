// The shape of a bottom-nav item, beside pdx-bottom-nav: a .pdx script exports no type (#1210), and
// the library's manifest reads the shapes of the component's folder that it names.
export interface BottomNavItem {
    key: string;
    label: string;
    icon: string;
    badge?: string;
    badgeVariant?: 'default' | 'primary' | 'danger';
}
