// scripts/commit-message-check.mjs: each rule refuses what a public history must not carry, and a
// well-formed message passes. The commit-msg hook and the pull-request workflow both run it.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { messageProblems } from '../../../scripts/commit-message-check.mjs';

const REPO = join(__dirname, '..', '..', '..');
const SCRIPT = join(REPO, 'scripts', 'commit-message-check.mjs');
const KEY = `${'PDX'}UI-123`;
const SESSION = `${'Claude'}-Session: https://claude.ai/${'code'}/session_x`;

describe('commit-message-check', () => {
    it('the control: a conventional message with a body passes', () => {
        expect(messageProblems('fix(ui): pdx-menu keeps its items in place\n\nThe array was replaced, not patched.\n')).toEqual([]);
    });

    it('a breaking-change marker and a header without scope pass', () => {
        expect(messageProblems('refactor!: rename the outlet')).toEqual([]);
        expect(messageProblems('docs: say what ships')).toEqual([]);
    });

    it('a header without a conventional type is refused', () => {
        expect(messageProblems('Fixed the bug').join('\n')).toMatch(/type\(scope\): description/);
        expect(messageProblems('feature(ui): add it').join('\n')).toMatch(/type\(scope\): description/);
    });

    it('a header over 72 characters is refused, and 72 passes', () => {
        expect(messageProblems(`feat: ${'x'.repeat(67)}`).join('\n')).toMatch(/73 characters/);
        expect(messageProblems(`feat: ${'x'.repeat(66)}`)).toEqual([]);
    });

    it('a description starting with a capital letter is refused', () => {
        expect(messageProblems('fix: Handle the null case').join('\n')).toMatch(/lowercase/);
    });

    it('an issue-tracker key anywhere in the message is refused', () => {
        expect(messageProblems(`fix: a count\n\nCloses ${KEY}.`).join('\n')).toMatch(/issue-tracker key/);
    });

    it('a finding of an internal review is refused; a function key is not one', () => {
        expect(messageProblems(`fix(ui): the panel survives\n\nFound in review ${'L'}-143.`).join('\n')).toMatch(/review finding/);
        expect(messageProblems('fix(ui): the context menu opens on Shift+F10')).toEqual([]);
    });

    it('the package scope and the product name are not mistaken for a key', () => {
        expect(messageProblems('fix(ui): the @pdxui scope and PDX UI read the same')).toEqual([]);
    });

    it('a session-link trailer is refused', () => {
        expect(messageProblems(`fix: a count\n\n${SESSION}`).join('\n')).toMatch(/session link/);
    });

    it('an assistant co-author trailer is refused', () => {
        expect(messageProblems('fix: a count\n\nCo-Authored-By: Claude <noreply@anthropic.com>').join('\n')).toMatch(/co-author/);
        expect(messageProblems('fix: a count\n\nCo-authored-by: A Person <a@example.com>')).toEqual([]);
    });

    it('a path from a maintainer machine is refused', () => {
        expect(messageProblems('fix: a count\n\nSeen in C:\\Users\\someone\\repo.').join('\n')).toMatch(/local path/);
        expect(messageProblems('fix: a count\n\nSeen in /home/someone/repo.').join('\n')).toMatch(/local path/);
    });

    it('git-generated messages pass: reverts, fixups, squashes', () => {
        expect(messageProblems('Revert "fix: a count"\n\nThis reverts commit abc.')).toEqual([]);
        expect(messageProblems('fixup! fix: a count')).toEqual([]);
        expect(messageProblems('squash! fix: a count')).toEqual([]);
    });

    it('comment lines git strips are not checked', () => {
        expect(messageProblems(`fix: a count\n# Please enter the commit message. ${KEY}\n`)).toEqual([]);
    });

    it('the command exits 1 on a refused message and 0 on a good one', () => {
        expect(() => execFileSync(process.execPath, [SCRIPT, '--text', 'Bad header'], { stdio: 'pipe' })).toThrow();
        expect(execFileSync(process.execPath, [SCRIPT, '--text', 'fix: a good one'], { encoding: 'utf-8' })).toBe('');
    });

    it('the hook runs the check, and its only way out is the local lab setting', () => {
        const hook = readFileSync(join(REPO, '.githooks', 'commit-msg'), 'utf-8');
        expect(hook).toMatch(/exec node scripts\/commit-message-check\.mjs "\$1"/);
        expect(hook).toMatch(/git config --get pdxui\.lab/);
    });
});
