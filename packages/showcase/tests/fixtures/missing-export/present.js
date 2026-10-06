// The control: the same entry, importing a name @pdxui/core does export, and never using it. Built
// by missing-export.spec.ts.
import { signal } from '@pdxui/core';

export const unrelated = 1;
