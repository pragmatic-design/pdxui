# @pdxui/router

Routing for PDX UI. A `.pdx` file becomes a page by declaring its path. The compiler collects
the declarations into the route table, and each page loads lazily.

```bash
pnpm add @pdxui/router
```

```pdx
@page '/users/:id';
@guard 'admin.users';
```

```pdx
<nav><pdx-link to="/users/42">Ada</pdx-link></nav>
<pdx-router-outlet></pdx-router-outlet>
```

The first block is a page; the second is the app shell that renders it. `navigate('/users/42')` from
`@pdxui/router` navigates from code.

Routes are destroyed when you leave them. A route declared `@page '/results' { keepAlive };` is
frozen instead and resumed on return. In development the router matches paths at runtime. A production build replaces it with
a matcher generated from the project's `@page` declarations.

## Entry points

| Import | Contents |
|--------|----------|
| `@pdxui/router` | Navigation, guards, the current route and its params |
| `@pdxui/router/outlet` | `<pdx-router-outlet>` |
| `@pdxui/router/link` | `<pdx-link>` |

## Documentation

[Router](https://pdxui.com/docs/router), and the [architecture](../../docs/architecture/framework.md).

## License

[MIT](../../licenses/LICENSE-MIT.txt).
