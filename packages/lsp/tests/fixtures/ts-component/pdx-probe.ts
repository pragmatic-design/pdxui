// A component written in TypeScript, as an application may still write one with core's component():
// the library has none left (#1454), and the go-to-definition test needs one whose file exists. The
// two declarations stand in for core's, so the fixture typechecks without depending on it.
declare function component(tag: string, options: object): void;
declare function prop<T>(value: T): T;

component('pdx-probe', {
    props: {
        /** Steps must be visited in order. */
        linear: prop(false),
    },
});
