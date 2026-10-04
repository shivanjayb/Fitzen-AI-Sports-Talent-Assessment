# START HERE (any session, any Claude account)
Fitzen: read `docs/PROJECT_STATE.md` first. It has the project summary, architecture, history, current state, hard rules and the prioritised roadmap. After any milestone, add a line to its Log and update "Current state" / "What's next", then commit and push.

# Shared work log (every account, every session)
Several Claude accounts work on this project. They share context only through `docs/PROJECT_STATE.md` (Log section at the end):
- **Before starting:** run `git pull --rebase` (another account may have pushed), then read the last ~15 Log lines to see what other accounts did and anything left unfinished.
- **After every change or task (even small), before finishing:** append one line, then commit and push it with the change:
  `- YYYY-MM-DD [account: <signed-in email, or "unknown">] <what changed> (<commit>). Next/left: <what remains, or "none">`
- **If stopping mid-task** (token limit, interruption): log what was in progress, which files are touched and the exact next step, then commit and push.
- Also update "Current state" and "What's next" in that file when they change.

# Tools: free to use
You may use any installed skill, plugin, MCP connector, subagent/workflow orchestration or Artifact whenever it helps the task, without asking first. Exceptions that still need a yes in chat: sending messages or email for the user, publishing something publicly, spending money, deploying to production, force-pushing or rewriting git history, and anything touching credentials.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- Start every chat by querying the graph for context instead of reading files from scratch.
- After any change, even minor, run `graphify update .` before finishing (AST-only, no API cost). A Stop hook in `/Users/shiv/my_projects/.claude/settings.json` also runs it automatically.

# ponytail (all projects, every code task)
Always work in ponytail mode (`/ponytail:ponytail`, level **ultra**: YAGNI extremist, deletion before addition, challenge requirements before building) for any code change, without being asked:
- Climb the ladder before writing: does it need to exist → already in the codebase → stdlib → native platform → installed dependency → one line → only then minimal code.
- Shortest working diff, fewest files. No unrequested abstractions, no scaffolding "for later", no new dependencies for what a few lines can do. Prefer deleting code to adding it.
- Root-cause fixes in the shared function, not per-caller patches. Never skip validation, security, error handling or accessibility.
- Keep replies short: code first, then at most three lines on what was skipped. Mark deliberate shortcuts with a `ponytail:` comment.
- Save tokens: query the graphify graph instead of bulk-reading files, read only the lines you need.

# gstack by default (every project)
Use the matching gstack skill by default instead of an ad-hoc approach, without being asked:
- Bug or "why is X broken" → `/investigate`. Code review before commit → `/review`. Security → `/cso`.
- Testing the running app → `/qa` (fix) or `/qa-only` (report). Web browsing/screenshots → `/browse`.
- New feature or plan → `/office-hours` or `/autoplan` (CEO/eng/design reviews). UI design → `/design-review`, `/design-consultation`.
- Shipping → `/ship`, then `/land-and-deploy`, `/canary`. Docs after shipping → `/document-release`. Perf → `/benchmark`.
- Risky/destructive work → `/careful` or `/guard`. Weekly summary → `/retro`.
Combine with ponytail ultra (shortest diff) and graphify (query first, update after).

# agentic-awesome-skills (use whenever one fits)
`~/.claude/skills` holds the agentic-awesome-skills catalog (~2,400 skills). When a task matches a skill there (e.g. `react-best-practices`, `typescript-expert`, `computer-vision-expert`, `vitest-skill`, `seo-audit`, `readme`, `api-design-principles`), use it, after gstack (which wins on overlap) and alongside ponytail ultra.
Safety, because the catalog is unaudited: read the skill's SKILL.md before following it; never run its scripts that download/execute remote code, touch credentials or tokens, or send data off the machine; skip offensive/pentest skills unless the user asks for security testing.

# Default skill stack by task
- **Coding (React/TS/Vercel):** vercel-labs agent-skills: `vercel-react-best-practices`, `vercel-composition-patterns`, `vercel-react-view-transitions`, `web-design-guidelines`, `writing-guidelines`, `vercel-optimize`. Don't use `vercel-cli-with-tokens` or `deploy-to-vercel` without asking (they handle credentials or deploy).
- **Big multi-step or parallel work:** Claude orchestration via the Workflow tool (load the `workflow-authoring` skill first) or Agent subagents for independent pieces. Keep it small: one agent per independent area.
- **Any UI/UX change:** use these together:
  - `impeccable`, guided by `apps/web/PRODUCT.md` and `DESIGN.md` (critique, polish, audit, animate).
  - `ui-ux-pro-max` for styles, palettes and UX rules.
  - Emil Kowalski's skills (github.com/emilkowalski/skills): `emil-design-eng`, `improve-animations`, `review-animations`, `find-animation-opportunities`, `animation-vocabulary`.
  - taste-skill: `design-taste-frontend`, `high-end-visual-design`, `minimalist-ui`, `redesign-existing-projects`, `gpt-taste`.
  - awesome-design-md: reference brand systems in `/Users/shiv/my_projects/awesome-design-md/design-md/` (e.g. apple, linear).
  - Then check with `web-design-guidelines` and gstack `/design-review`, and verify in the built-in browser pane.
