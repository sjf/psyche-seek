---
name: yeet
description: Land the current worktree branch on remote main and tear the session down — push the commits to origin main, stop any daemon/Vite dev servers started in this conversation, remove the worktree and its branch, and announce the thread is ready to be archived. Use when the user says "yeet", "yeet it", "ship it and clean up", or wants to merge the current change to main and close out this worktree session.
---

# Yeet

Finish a worktree session: merge to main, shut down dev processes, delete the
worktree, and hand the thread off for archiving. This repo does not use pull
requests — changes land by pushing directly to `origin main`.

Run the steps in order. If any step fails, stop and report — never delete the
worktree or branch until the push to main has verifiably landed.

## 1. Preflight

- Confirm you are in a worktree on a feature branch (not `main`).
- `git status` must be clean. If there are uncommitted changes, stop and ask
  the user whether to commit or discard them — don't guess.
- Record the branch name, the worktree path, and the main checkout path
  (`git worktree list` — the first entry is the main checkout).

## 2. Merge to remote main

```bash
git fetch origin
git rebase origin/main   # only needed if origin/main moved since branching
git push origin HEAD:main
```

If the rebase hits conflicts, abort it and report to the user instead of
resolving on your own. After pushing, verify the merge landed before anything
destructive:

```bash
git fetch origin
git merge-base --is-ancestor HEAD origin/main && echo landed
```

## 3. Stop dev processes started in this conversation

Only kill what this conversation started — other sessions and the human run
their own daemons.

- Stop any background shells/tasks from this session (dev.sh, Vite, daemons).
- For detached daemons, kill by the web port you launched them on:
  `kill $(lsof -t -iTCP:<port> -sTCP:LISTEN)`. The launcher's `$!` is not the
  daemon (pseek forks), and `pkill -f pseek` would kill other sessions' and
  the human's daemons — never use it.
- Leave ports 7007/5173 alone unless this conversation started dev.sh itself.
- If this conversation claimed a `.creds` account (its line in the main
  checkout's `.creds` carries a web port this session assigned), release it:
  take the `.creds.lock` mkdir lock, strip the port from the line (leaving
  `username/password`), remove the lock. Protocol details are in AGENTS.md
  under "Claiming a `.creds` account".

## 4. Delete the worktree and branch

The shell's cwd is inside the worktree, so run these against the main checkout
and don't use relative paths afterwards — the cwd ceases to exist.

```bash
git -C <main-checkout> worktree remove --force <worktree-path>
git -C <main-checkout> branch -D <branch>
git ls-remote --exit-code origin <branch> && git -C <main-checkout> push origin --delete <branch>
```

`--force` is safe here because step 2 already verified every commit is on
`origin/main`; the worktree usually holds ignored build output (`.venv`,
`node_modules`) that would otherwise block removal.

## 5. Sign off

Summarize what landed (commit subjects + short hashes now on `origin/main`)
and end with: **This thread is ready to be archived.**
