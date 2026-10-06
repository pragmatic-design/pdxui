declare module '@pdxui/ui/all';
// Every component package's manifest, read at build time by lib/component-manifests-plugin.ts.
declare module 'virtual:pdx-component-manifests' {
    const packages: { package: string; manifest: { schemaVersion: string; modules: { declarations: Record<string, unknown>[] }[] } }[];
    export default packages;
}
