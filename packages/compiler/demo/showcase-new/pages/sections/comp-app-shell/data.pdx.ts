// The navigation model the app-shell demos draw: a service desk's, in two groups, one entry needing a
// permission the demo does not grant (so it is not drawn).

export const shellItems = [
    { key: 'work', label: 'Work', items: [
        { key: 'tickets', label: 'Tickets', href: '/demo/tickets', icon: 'list', badge: 12 },
        { key: 'board', label: 'Board', href: '/demo/board', icon: 'layout-grid' },
        { key: 'customers', label: 'Customers', href: '/demo/customers', icon: 'users' },
        { key: 'billing', label: 'Billing', href: '/demo/billing', icon: 'credit-card', permission: 'billing.read' },
    ] },
    { key: 'you', label: 'You', items: [
        { key: 'account', label: 'Account', href: '/demo/account', icon: 'user' },
        { key: 'settings', label: 'Settings', href: '/demo/settings', icon: 'settings', exact: false },
    ] },
];

export const shellHome = { key: 'home', label: 'Dashboard', href: '/demo', icon: 'home' };
