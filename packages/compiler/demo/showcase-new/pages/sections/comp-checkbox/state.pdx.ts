// The "Select all" helpers the indeterminate and the composition sections share.
export function allOn(list) { return list.every(i => i.on); }

export function someOn(list) { return list.some(i => i.on) && !list.every(i => i.on); }

export function setAll(list, on) { return list.map(i => Object.assign({}, i, { on })); }

export function setOne(list, detail) { return list.map(i => i.label === detail.value ? Object.assign({}, i, { on: detail.checked }) : i); }
