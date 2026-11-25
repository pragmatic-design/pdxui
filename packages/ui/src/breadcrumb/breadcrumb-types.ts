// pdx-breadcrumb's public types, beside the component: a .pdx file exports its element, and an app
// that builds its crumbs in TypeScript imports this shape from `@pdxui/ui/breadcrumb`.

export interface BreadcrumbItem {
    key: string;
    label: string;
    href?: string;
    icon?: string;
}
