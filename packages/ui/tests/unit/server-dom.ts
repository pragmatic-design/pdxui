// The server DOM a static build installs (#160), for a suite that renders components in Node: imported
// FIRST by such a suite, before core. `PdxElement` extends the HTMLElement it finds when its module is
// evaluated, and an ES module's imports are evaluated in the order they are written, so a static import
// of this module ahead of the others is what a build's entry does (`packages/cli/src/commands/ssg-entry.ts`).
import { installServerDom } from '@pdxui/core/server-dom';

installServerDom();
