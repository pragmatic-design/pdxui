// The shape of a crumb, beside pdx-page-header: a .pdx script exports no type (#1210), and the
// library's manifest reads the shapes of the component's folder that it names.
export interface PageHeaderCrumb {
    key: string;
    label: string;
    href?: string;
}
