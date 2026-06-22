---
description: Orient Manuel for a new session — current task, recent guidance, how to start
---

Read `.claude/manny-tasks.md` and present Manuel with a brief, action-ready session orientation. He's part-time on this team; the goal is to get him from "I just sat down" to "I'm coding" in under a minute.

Structure the output:

1. **Welcome line** — greet him by name. If there are commits on his active `manny/*` branch since his last session, mention them in one sentence so he knows where he left off.

2. **Active task** — pull from the `## Active tasks` section. Show only the currently-active one (if multiple, the topmost). Include: task title, branch name, spec location, one-line "why," and acceptance criteria. Brief.

3. **Recent guidance** — anything in the `## Recent guidance from Sean` section that's relevant to the active task. Skip if nothing new.

4. **What to do right now** — pull from `## Recommendations for how to start`, but adapt to current state:
   - If the branch doesn't exist yet on origin: tell him "I'll create the branch and pull the spec PDF, ready?"
   - If the branch exists with commits: "Resuming where you left off. Last commit was: [message]. Want me to run `npm run dev` and pick up?"
   - If the branch is far behind main: mention it and offer to rebase.

5. **Two-line operating reminder** — quoted from the file: tell Claude what you want, not how. Pre-push hooks are sacred.

End with an open prompt: "Ready to go, or want to discuss the spec first?"

Tone: warm but efficient. Manuel is not a developer by background; assume he wants to be in motion, not in planning. Avoid jargon unless it's already in the file.
