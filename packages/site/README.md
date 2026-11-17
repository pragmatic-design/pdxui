# @pdxui/site — pdxui.com

Showcase site for **PDX UI**. It is a **100% PDX** app (dogfooding): the technology
it documents is the one it is built with. Pragmatic family branding (dark/gold).

## Commands
```bash
pnpm --filter @pdxui/site dev      # dev server (port 5300)
pnpm --filter @pdxui/site build    # static build → dist/  (deployment is external)
pnpm --filter @pdxui/site preview   # preview the build
```

## Directory layout (isolated and ordered — a contract)
```
packages/site/
├── index.html              # entry: mounts <app-app>, imports the CSS, the site's components and the shell
├── vite.config.ts          # pdx() plugin, output dist/
├── public/                 # static assets served as-is (favicon, og-image, logo)
├── content/                # CONTENT (kept apart from the code)
│   └── docs/               # documentation markdown → rendered by the G2 pipeline
├── scripts/                # site build tooling (indexes, llms.txt, …)
└── src/
    ├── app.pdx             # shell: header, <pdx-router-outlet>, footer, theme toggle
    ├── routes/             # one page per file, each with its own @page
    │   ├── landing.pdx       #   @page '/'
    │   ├── docs.pdx          #   @page '/docs', '/docs/:slug'
    │   ├── components.pdx    #   @page '/components'
    │   ├── component.pdx     #   @page '/components/:tag' — from the UI manifest
    │   ├── design.pdx        #   @page '/design', '/design/:topic'
    │   ├── integrations.pdx  #   @page '/integrations'
    │   ├── playground.pdx    #   @page '/playground'
    │   └── search.pdx        #   @page '/search'
    ├── components/         # the SITE's own UI components (header, sidebar, code-block, demo-block)
    ├── lib/                # reusable infrastructure (markdown loader, doc layout, manifest)
    └── styles/             # site CSS (on top of the --pdx-* tokens)
```

### Ordering rules
- **One concept = one file or directory.** Routes live in `src/routes/`, the site's components
  in `src/components/`, reusable logic in `src/lib/`, content in `content/`.
- **Content is not code.** Markdown lives in `content/`, never mixed into `src/`.
- **No monoliths.** The shell stays thin; the parts that grow (sidebar, search, code-block)
  become dedicated files in `src/components/`.
- **Auto-import.** The `<pdx-*>` tags used in templates are imported by the compiler — do not
  import them by hand. Routes are not imported either: the compiler's route table names each `@page`
  and loads it the first time it is shown, so each route is its own chunk.
