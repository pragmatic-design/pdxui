// The shape of a speed-dial action, beside pdx-fab: a .pdx script exports no type (#1210), and the
// library's manifest reads the shapes of the component's folder that it names.
export interface FabAction {
    key: string;
    label: string;
    icon: string;
}
