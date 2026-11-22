// What a build's setup returns (#1289): the names the code outside the setup reads off the context.
// Core copies the setup's return onto the context at every mount (`Object.assign(ctx, result)`), so a
// name nothing outside reads is a property written per instance for nothing.

/**
 * The names `code` reads off the component context, as `ctx.<name>`: the render, the host's bindings
 * and listeners, the hoisted slots and snippets all reach the setup's names that way (`prefixCtx`).
 */
export function namesReadOffCtx(code: string): Set<string> {
    const names = new Set<string>();
    // Match: `ctx.name`, not a member of something else (`x.ctx.name`), not a longer identifier
    // (`myctx.name`). Groups: [1]=the name
    for (const m of code.matchAll(/(?<![\w$.])ctx\.([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    return names;
}
