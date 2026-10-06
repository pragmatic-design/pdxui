// getValues() is a snapshot: reading every field first makes the view follow them.
export function valuesJson(form) {
  for (const k of Object.keys(form.fields)) form.fields[k].value();
  return JSON.stringify(form.getValues(), null, 2);
}
