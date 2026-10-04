## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- Start every chat by querying the graph for context instead of reading files from scratch.
- After any change, even minor, run `graphify update .` before finishing (AST-only, no API cost). A Stop hook in `/Users/shiv/my_projects/.claude/settings.json` also runs it automatically.

# ponytail (all projects, every code task)
Always work in ponytail mode (`/ponytail:ponytail`, level full) for any code change, without being asked:
- Climb the ladder before writing: does it need to exist → already in the codebase → stdlib → native platform → installed dependency → one line → only then minimal code.
- Shortest working diff, fewest files. No unrequested abstractions, no scaffolding "for later", no new dependencies for what a few lines can do. Prefer deleting code to adding it.
- Root-cause fixes in the shared function, not per-caller patches. Never skip validation, security, error handling or accessibility.
- Keep replies short: code first, then at most three lines on what was skipped. Mark deliberate shortcuts with a `ponytail:` comment.
- Save tokens: query the graphify graph instead of bulk-reading files, read only the lines you need.
