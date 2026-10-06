// The one reorder every list on the sortable-list page applies: the store's task list
// and the rows and horizontal sections. A module of its own, because a @store module cannot export.

// The component hands back the indices; applying them is the application's job, and this is what
// that looks like. The list is never mutated in place: a new array is what makes the signal fire.
export function move(list, detail) {
  const next = list.slice();
  next.splice(detail.to, 0, ...next.splice(detail.from, 1));
  return next;
}
