import { formField, formFieldNames } from '@pdxui/core';

// getValues() is a snapshot: reading every field first makes the view follow them.
export function valuesJson(form) {
  for (const k of formFieldNames(form)) formField(form, k).value();
  return JSON.stringify(form.getValues(), null, 2);
}
