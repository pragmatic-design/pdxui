// Tests for DTS (.d.ts) type generation.

import { describe, it, expect } from 'vitest';
import { generateDts } from '../src/compiler/dts-generator';
import type { DtsInput } from '../src/compiler/dts-generator';

describe('DTS Generator', () => {
    it('generates Props interface', () => {
        const input: DtsInput = {
            tag: 'pdx-counter',
            props: [
                { name: 'label', tsType: 'string', runtimeType: 'String', default: "'Click'" },
                { name: 'count', tsType: 'number', runtimeType: 'Number' },
            ],
            events: [],
            slots: [],
        };
        const dts = generateDts(input);
        expect(dts).toContain('export interface PdxCounterProps');
        expect(dts).toContain('label?: string;');
        expect(dts).toContain('count?: number;');
    });

    it('generates Events interface', () => {
        const input: DtsInput = {
            tag: 'pdx-button',
            props: [],
            events: [
                { name: 'click', payloadType: 'MouseEvent' },
                { name: 'change', payloadType: '{ value: string }' },
            ],
            slots: [],
        };
        const dts = generateDts(input);
        expect(dts).toContain('export interface PdxButtonEvents');
        expect(dts).toContain('click: MouseEvent;');
        expect(dts).toContain('change: { value: string };');
    });

    it('generates Slots interface with scope types', () => {
        const input: DtsInput = {
            tag: 'pdx-list',
            props: [],
            events: [],
            slots: [
                { name: 'default', scopeType: '{ item: Item; index: number }' },
                { name: 'header' },
            ],
        };
        const dts = generateDts(input);
        expect(dts).toContain('export interface PdxListSlots');
        expect(dts).toContain('default: { item: Item; index: number };');
        expect(dts).toContain('header: {};');
    });

    it('generates HTMLElementTagNameMap augmentation', () => {
        const input: DtsInput = {
            tag: 'pdx-card',
            props: [{ name: 'title', tsType: 'string', runtimeType: 'String' }],
            events: [],
            slots: [],
        };
        const dts = generateDts(input);
        expect(dts).toContain("'pdx-card': HTMLElement & PdxCardProps");
    });

    it('generates @fetch resource types', () => {
        const input: DtsInput = {
            tag: 'pdx-users',
            props: [],
            events: [],
            slots: [],
            fetches: [
                { name: 'users', method: 'GET', url: '/api/users', type: 'User[]', hasReactiveParams: false },
                { name: 'profile', method: 'GET', url: '/api/profile', hasReactiveParams: false },
            ],
        };
        const dts = generateDts(input);
        expect(dts).toContain('export type UsersResource = User[];');
        expect(dts).toContain('export type ProfileResource = unknown;');
    });

    it('generates @search params interface', () => {
        const input: DtsInput = {
            tag: 'pdx-search',
            props: [],
            events: [],
            slots: [],
            searchParams: [
                { name: 'page', type: 'number', optional: false, default: '1' },
                { name: 'filter', type: 'string', optional: true },
            ],
        };
        const dts = generateDts(input);
        expect(dts).toContain('export interface PdxSearchSearchParams');
        expect(dts).toContain('page: number;');
        expect(dts).toContain('filter?: string;');
    });

    it('generates @store hook type', () => {
        const input: DtsInput = {
            tag: 'pdx-cart-store',
            props: [],
            events: [],
            slots: [],
            store: { name: 'cart', initialExpr: '{}' },
        };
        const dts = generateDts(input);
        expect(dts).toContain('export declare function useCart(): Record<string, unknown>;');
    });

    it('generates @form value types', () => {
        const input: DtsInput = {
            tag: 'pdx-user-form',
            props: [],
            events: [],
            slots: [],
            forms: [{ name: 'user', schemaType: 'UserDto' }],
        };
        const dts = generateDts(input);
        expect(dts).toContain('export type UserFormValues = UserDto;');
    });
});
