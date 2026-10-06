// The overlay-outlet page's last answer: the confirm and the stacking sections ask, the confirm
// section shows it.
@store outletAnswer;

import { dialog } from '@pdxui/ui/dialog';

let answer = $signal('none yet');

async function askDelete() {
  const ok = await dialog.confirm({
    title: 'Delete project?',
    message: 'The project and its 12 files will be removed. This cannot be undone.',
    confirmLabel: 'Delete', cancelLabel: 'Keep it', variant: 'danger',
  });
  answer = ok ? 'deleted' : 'kept';
}

async function askTyped() {
  const ok = await dialog.confirm({
    title: 'Delete "atlas"?',
    message: 'Type the project name to confirm.',
    confirmLabel: 'Delete', variant: 'danger', confirmText: 'atlas',
  });
  answer = ok ? 'atlas deleted' : 'atlas kept';
}

async function askDelayed() {
  const ok = await dialog.confirm({
    title: 'Publish now?',
    message: 'The release goes to every user. The button waits three seconds.',
    confirmLabel: 'Publish', confirmDelay: 3,
  });
  answer = ok ? 'published' : 'not published';
}

async function stack() {
  dialog.open({ title: 'Settings', message: 'The dialog underneath.', size: 'md' });
  const ok = await dialog.confirm({ title: 'Reset all settings?', message: 'This one is on top: Escape closes it and leaves Settings open.', confirmLabel: 'Reset' });
  answer = ok ? 'settings reset' : 'settings kept';
}
