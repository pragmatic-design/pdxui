// The `test` every showcase spec uses: certify's fixture, one browser context per worker reset between
// tests, with the suite's signed-in `storageState` laid down again on each test's first navigation.
//
// A fresh context per test opened fresh connections to the preview server every time: the build suite
// alone left 3,298 sockets in TIME_WAIT on its port, and inside the full pre-push gate on Windows a
// `page.goto` was refused (#32). Everything of '@playwright/test' is re-exported, so a spec changes only
// where it imports from; `packages/core/tests/certify-worker-context.test.ts` fails on a spec that does not.
export * from '../../responsive/tests/integration/ui-components/contracts/fixture';
