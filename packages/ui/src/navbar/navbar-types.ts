// The shape of a navbar link, beside pdx-navbar: a .pdx script exports no type (#1210), and the
// library's manifest reads the shapes of the component's folder that it names.
export interface NavbarItem {
    key: string;
    label: string;
    href?: string;
    icon?: string;
    active?: boolean;
}
