// pathToUri must match VS Code's URI form so documents.get()
// finds open buffers on Windows (lowercase drive + %3A-encoded colon) instead of
// falling back to stale disk content.

import { describe, it, expect } from 'vitest';
import { pathToUri } from '../src/utils/uri';

describe('pathToUri',() => {
    it('encodes a Windows path the way VS Code does (lowercase drive + %3A)', () => {
        expect(pathToUri('C:\\Users\\me\\app\\widget.pdx'))
            .toBe('file:///c%3A/Users/me/app/widget.pdx');
    });

    it('handles already-forward-slashed Windows paths', () => {
        expect(pathToUri('D:/Projects/x.pdx')).toBe('file:///d%3A/Projects/x.pdx');
    });

    it('leaves POSIX absolute paths as a standard file URI', () => {
        expect(pathToUri('/home/me/app/widget.pdx')).toBe('file:///home/me/app/widget.pdx');
    });

    it('does NOT emit the old uppercase-drive form that missed open buffers', () => {
        expect(pathToUri('C:\\a\\b.pdx')).not.toBe('file:///C:/a/b.pdx');
    });
});
