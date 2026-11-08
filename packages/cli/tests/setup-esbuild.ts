// esbuild fixes the working directory of its service process when its module is first evaluated
// (`defaultWD = process.cwd()` in its main.js), and keeps that service for the life of the process.
// `pdx build` imports Vite, and through it esbuild, only when it runs; a test that builds from inside its
// project would start the service there, and on Windows a process's working directory cannot be removed
// (EBUSY). Importing Vite here, before any test, evaluates esbuild from this package's directory, in
// every test file's process. `build-esbuild-cwd.test.ts` holds it (#923).
import 'vite';
