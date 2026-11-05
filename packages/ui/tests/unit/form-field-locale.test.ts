// pdx-form-field re-resolves its error message when the validation locale changes (#881). The field
// subscribes to the locale for this, and since #881 it unsubscribes when it is destroyed. That half is
// memory only: a removed field's leftover listener bumps a signal nothing reads any more, so happy-dom
// cannot see it. `packages/showcase/tests/scenario-component-retention.spec.ts` counts the instances a
// removal leaves, in Chromium. This test holds the half a user sees: the message follows the locale.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setValidationLocale, clearValidationLocale, validationMessage } from '@pdxui/core';
import { cleanup, mount, tick } from './helpers';
import '../../src/form-field/pdx-form-field';

type FieldEl = HTMLElement & { error: unknown };

describe('pdx-form-field and the validation locale', () => {
    beforeEach(cleanup);
    afterEach(() => { clearValidationLocale(); });

    it('shows the message in the locale set after it rendered', async () => {
        const el = await mount<FieldEl>('pdx-form-field', { 'show-error': '' });
        el.error = validationMessage('validation.required', 'This field is required');
        await tick();
        expect(el.querySelector('.pdx-field-error')?.textContent).toBe('This field is required');

        setValidationLocale((key) => (key === 'validation.required' ? 'Campo obbligatorio' : undefined));
        await tick();
        expect(el.querySelector('.pdx-field-error')?.textContent).toBe('Campo obbligatorio');
    });
});
