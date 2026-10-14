# The behavioural test of the description API

Size limits and reachability checks measure `__PDX_DEVTOOLS__` v2 (`map`, `shell`, `page`,
`outline`), but they cannot tell whether an agent can do the work with it. A description could
leave out exactly what an agent needs and still pass all of them. So this script gives a model a
set of tasks on the showcase and runs each one twice:

- **with the description API**, and nothing else to read the page with;
- **with full accessibility snapshots**, which is what an agent reads today.

The description API passes when the agent completes **at least as many tasks** with it as with
snapshots, over two runs.

It runs a model, so it stays outside CI and outside the gate, as `docs/language/beta/decisions.md`
(point 41) decides. Run it when you change the description API, and put its JSON result in the
pull request.

```bash
node scripts/agent-behaviour/run.mjs                      # every task, both modes, two runs
node scripts/agent-behaviour/run.mjs --runs 1 --tasks customers-sort,nav-users
node scripts/agent-behaviour/run.mjs --list               # the tasks
node scripts/agent-behaviour/run.mjs --help
```

## What it needs

- **[Claude Code](https://claude.com/claude-code) (`claude`)**, signed in. The agent runs as
  `claude -p --model sonnet` (`--model` changes it). It runs with `--safe-mode`, so none of the
  machine's `CLAUDE.md`, skills, plugins, hooks or MCP servers reach it. Its only tool is Bash, and
  only for one command, `node scripts/agent-behaviour/tool.mjs`.
- **[agent-browser](https://www.npmjs.com/package/agent-browser)** to drive the browser
  (`npm install -g agent-browser`, then `agent-browser install`).

Neither is a dependency of the repository. When either is missing from `PATH`, the script says so
and exits with code 2. The showcase must have its dependencies installed, and core, router and ui
built (`pnpm build`). The script starts the showcase's dev server itself, on port 5314
(`--port`), because the devtools global exists in development only.

## How a task runs

Each task gets a browser session of its own: signed in as the showcase's admin, in English, at
1440 × 900, on the task's start page. The script then runs the task's **check** before the agent
starts. A check that already holds at that point would measure nothing, so the task is marked
`INVALID` and the run exits non-zero.

Next the agent gets the task in one sentence and one command, `tool.mjs`, which does two things:

- **It keeps the modes apart.** In `description` mode the agent reads only through `map`, `shell`,
  `page` and `outline`. In `snapshot` mode it reads only through agent-browser's `snapshot`. Both
  modes act the same way: `open`, `click`, `fill`, `press`, `url` and `wait`.
- **It counts every answer it gives.** "Characters sent" is the prompt plus every answer of
  `tool.mjs`.

When the agent stops, the script runs the check again. **The check decides**, never the agent's
claim. For a task that asks for a reply, the check compares the reply with what the page shows,
reading the page itself.

The agent is told to run one command per call. The permission covers that one command, so a chain
(`a && b`) is refused as a whole. Before that line was in the prompt, an agent that had planned a
whole wizard step from the outline sent it as one chain. The chain was refused and the agent gave up,
four runs out of four. That measured the test bench, not the API.

`--safe-mode` does not cover every user setting: a language set for Claude Code still applies, so
the agent may reply in it. The checks compare only what the page shows, so this changes nothing.

`click` and `fill` scroll their target into view first. The showcase scrolls an element of its
shell, not the window, and agent-browser's click lands on the element's coordinates without
scrolling that element: it hits nothing and still answers "Done".

## The tasks

They are in `tasks.mjs`, on the four pages the description API is measured on: `/customers`,
`/intake`, `/tickets` and `/`. They cover the following.

- **On `/customers`:** filter by a status, open page 2, find a customer through the search box,
  and sort by name.
- **On `/intake`:** submit step 1 with an invalid email and report the error shown, then complete
  step 1.
- **On `/tickets`:** change a ticket's status.
- **From `/`:** reach two pages through the navigation, and read a count off the dashboard.

The ticket's status is changed on `/tickets`, in the record drawer. `/tickets/12`, the page the
issue named, has no status control.

## The result

The script writes one line per task and mode as it goes. At the end it writes a summary: each
mode's completion and characters, and their ratio. The JSON goes to
`test-results/agent-behaviour.json` (`--out`), which git ignores, and holds every run with:

- the verbs the agent used;
- its turns;
- the check's detail.

The log of each session is under `test-results/agent-behaviour-logs/`.

The bar is completion with the description API ≥ completion with snapshots. Two runs are the
minimum, because a model's run is not repeatable.
