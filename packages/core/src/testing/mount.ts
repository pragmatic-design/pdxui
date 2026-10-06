// Testing utility: mount HTML with custom elements and cleanup.

const containers: HTMLElement[] = [];

/**
 * Mount HTML into a container, wait for custom elements to upgrade.
 * Returns the container element for querying.
 */
export async function mount(html: string): Promise<HTMLElement> {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    containers.push(container);

    // Wait for custom elements to upgrade (only elements with a hyphen are valid CE names)
    const allEls = container.querySelectorAll('*');
    const customEls = Array.from(allEls).filter(el => el.localName.includes('-'));
    if (customEls.length > 0) {
        await Promise.all(
            customEls.map(el =>
                customElements.whenDefined(el.localName)
            )
        );
    }

    // Flush microtasks
    await new Promise<void>(r => queueMicrotask(r));

    return container;
}

/**
 * Remove all mounted containers from the DOM.
 */
export function cleanup(): void {
    for (const c of containers) {
        c.remove();
    }
    containers.length = 0;
}
