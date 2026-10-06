// The sortable-list page's task list: the first section reorders it, the disabled section shows the
// same order.
@store sortableTasks;

import { move } from './data.pdx';

let tasks = $signal([
  { id: 1, label: 'Triage new tickets' },
  { id: 2, label: 'Answer the escalation' },
  { id: 3, label: 'Close last week’s backlog' },
  { id: 4, label: 'Write the incident note' },
]);

function onReorder(e) { tasks = move(tasks, e.detail); }
