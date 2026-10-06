// A plain `<a href>` whose click the router takes.
//
// The anchor keeps its `href`, so a middle click, Ctrl/⌘ or Shift still opens a tab or a window the
// way a link does; a plain click navigates inside the app instead of reloading it.
import { navigate } from '@pdxui/router';

export function followLink(e: MouseEvent, href: string): void {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    navigate(href);
}
