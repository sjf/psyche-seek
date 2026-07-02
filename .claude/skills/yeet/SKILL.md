---
name: yeet
description: Land the current worktree branch on remote main and close out the session — push the commits to origin main, stop any daemon/Vite dev servers started in this conversation, and announce the thread is ready to be archived. Use when the user says "yeet", "yeet it", "ship it and clean up", or wants to merge the current change to main and close out this worktree session.
---

# Yeet

Finish a worktree session: merge to main, shut down dev processes, and hand
the thread off for archiving. This repo does not use pull requests — changes
land by pushing directly to `origin main`.

Do NOT delete the worktree or its branch — the chat session lives in the
worktree, and removing it makes the archived chat impossible to unarchive.
Leave both in place; the human prunes worktrees separately.

Run the steps in order. If any step fails, stop and report.

## 1. Preflight

- Confirm you are in a worktree that is not the main checkout.
- If the worktree is on `main`, stop and report instead of pushing or deleting it.
- If the worktree is on a detached `HEAD`, create a temporary branch from the
  current `HEAD` before committing or rebasing. Prefer `sjf/yeet-<short-sha>`
  unless a clearer branch name already exists.
- If there are uncommitted changes, inspect `git status --short` and `git diff --stat`.
  When the changes are the current task's work, commit them with one coherent
  imperative message before continuing. Do not ask merely because the tree is dirty
  or detached after the user invoked `yeet`.
- Stop and ask only if the dirty tree contains unrelated user changes, secrets,
  generated files that should not be committed, or anything else that makes the
  commit scope ambiguous.
- Record the branch name, the worktree path, and the main checkout path (`git
  worktree list` — the first entry is the main checkout).

## 2. Merge to remote main

```bash
git fetch origin
git rebase origin/main   # only needed if origin/main moved since branching
git push origin HEAD:main
```

If the rebase hits conflicts, abort it and report to the user instead of
resolving on your own. After pushing, verify the merge landed:

```bash
git fetch origin
git merge-base --is-ancestor HEAD origin/main && echo landed
```

## 3. Stop dev processes started in this conversation

Only kill what this conversation started — other sessions and the human run
their own daemons.

- Stop any background shells/tasks from this session (dev.sh, Vite, daemons).
  Instances launched with `dev-test.sh` are stopped with
  `./dev-test.sh stop <dir>`, which also releases their `.creds` claim.
- For other detached daemons, kill by the web port you launched them on:
  `kill $(lsof -t -iTCP:<port> -sTCP:LISTEN)`. The launcher's `$!` is not the
  daemon (pseek forks), and `pkill -f pseek` would kill other sessions' and
  the human's daemons — never use it.
- Leave ports 7007/5173 alone unless this conversation started dev.sh itself.
- If this conversation claimed a `.creds` account manually (its line in the
  main checkout's `.creds` carries a web port this session assigned), release
  it: take the `.creds.lock` mkdir lock, strip the port from the line (leaving
  `username/password`), remove the lock. Protocol details are in AGENTS.md
  under "Claiming a `.creds` account".

## 4. Sign off

Summarize what landed (commit subjects + short hashes now on `origin/main`)
and end with: **This thread is ready to be archived.**
