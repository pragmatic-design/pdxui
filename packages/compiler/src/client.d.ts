// Module declaration for .pdx files.
// Add "@pdxui/compiler/client" to tsconfig compilerOptions.types for IDE support.

declare module '*.pdx' {
    const component: void;
    export default component;
}
