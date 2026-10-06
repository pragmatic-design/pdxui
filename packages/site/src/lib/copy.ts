// Shared "Copy" button for <pre> code blocks. Used by both the markdown enhancer
// (enhance.ts, runtime over Shiki-rendered HTML) and the <pdx-code> component.

/** Attach a copy-to-clipboard button to a <pre>. Idempotent (no-op if already attached). */
export function attachCopy(pre: HTMLElement): void {
    if (pre.querySelector('.md-copy')) return; // already enhanced
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'md-copy';
    btn.textContent = 'Copy';
    btn.addEventListener('click', () => {
        const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
        navigator.clipboard.writeText(code).then(() => {
            btn.textContent = 'Copied';
            setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        });
    });
    pre.classList.add('has-copy');
    pre.appendChild(btn);
}
