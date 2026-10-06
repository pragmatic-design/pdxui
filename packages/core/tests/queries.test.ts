import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getByText, queryByText, getByRole, queryByRole, getByTestId, type, click, clear } from '../src/testing/queries';

let container: HTMLElement;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
});

afterEach(() => {
    container.remove();
});

describe('getByText / queryByText', () => {
    it('finds element by exact text', () => {
        container.innerHTML = '<p>Hello World</p>';
        const el = getByText(container, 'Hello World');
        expect(el.tagName).toBe('P');
    });

    it('finds element by partial text', () => {
        container.innerHTML = '<span>Welcome to the app</span>';
        const el = getByText(container, 'Welcome');
        expect(el).toBeTruthy();
    });

    it('finds element by regex', () => {
        container.innerHTML = '<div>Error: 404</div>';
        const el = getByText(container, /Error: \d+/);
        expect(el).toBeTruthy();
    });

    it('queryByText returns null when not found', () => {
        container.innerHTML = '<div>Hello</div>';
        expect(queryByText(container, 'Goodbye')).toBeNull();
    });

    it('getByText throws when not found', () => {
        container.innerHTML = '<div>Hello</div>';
        expect(() => getByText(container, 'Nope')).toThrow('getByText');
    });
});

describe('getByRole / queryByRole', () => {
    it('finds button by implicit role', () => {
        container.innerHTML = '<button>Click me</button>';
        const el = getByRole(container, 'button');
        expect(el.tagName).toBe('BUTTON');
    });

    it('finds button by name', () => {
        container.innerHTML = '<button>Save</button><button>Cancel</button>';
        const el = getByRole(container, 'button', { name: 'Save' });
        expect(el.textContent).toBe('Save');
    });

    it('finds heading by implicit role', () => {
        container.innerHTML = '<h2>Title</h2>';
        const el = getByRole(container, 'heading');
        expect(el.tagName).toBe('H2');
    });

    it('finds element by explicit role attribute', () => {
        container.innerHTML = '<div role="alert">Warning!</div>';
        const el = getByRole(container, 'alert');
        expect(el.textContent).toBe('Warning!');
    });

    it('queryByRole returns null when not found', () => {
        container.innerHTML = '<div>Plain</div>';
        expect(queryByRole(container, 'button')).toBeNull();
    });
});

describe('getByTestId', () => {
    it('finds by data-testid', () => {
        container.innerHTML = '<input data-testid="email-input" />';
        const el = getByTestId(container, 'email-input');
        expect(el.tagName).toBe('INPUT');
    });

    it('throws when not found', () => {
        container.innerHTML = '<div>No test id</div>';
        expect(() => getByTestId(container, 'missing')).toThrow('getByTestId');
    });
});

describe('user events', () => {
    it('type() fills input value', async () => {
        container.innerHTML = '<input type="text" />';
        const input = container.querySelector('input')!;
        await type(input, 'hello');
        expect(input.value).toBe('hello');
    });

    it('click() dispatches click event', async () => {
        container.innerHTML = '<button>Go</button>';
        const btn = container.querySelector('button')!;
        let clicked = false;
        btn.addEventListener('click', () => { clicked = true; });
        await click(btn);
        expect(clicked).toBe(true);
    });

    it('clear() empties input', async () => {
        container.innerHTML = '<input type="text" value="old" />';
        const input = container.querySelector('input')!;
        input.value = 'old';
        await clear(input);
        expect(input.value).toBe('');
    });
});
