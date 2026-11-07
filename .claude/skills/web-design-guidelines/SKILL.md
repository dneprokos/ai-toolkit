---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

> **Local modification.** Upstream fetches the rules from GitHub on every run. This copy uses a reviewed, pinned snapshot instead, so the rules cannot change without a visible diff. Do not fetch the guidelines from the network.

## How It Works

1. Read the rules from `references/guidelines.md` (in this skill's folder)
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the guidelines file
4. Output findings in the terse `file:line` format defined in that file

## Guidelines Source

`references/guidelines.md` — snapshot of `vercel-labs/web-interface-guidelines` `command.md`, pinned to commit `4ecfb9fb8d1d3b7009674869b3aaee2f904042e1` (2026-10-05). The header comment in that file records the source URL and snapshot date.

To refresh: download the new upstream `command.md`, review the diff for unexpected instructions, then replace the body of `references/guidelines.md` and update the commit SHA here and in its header.

## Usage

When a user provides a file or pattern argument:
1. Read `references/guidelines.md`
2. Read the specified files
3. Apply all rules from the guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
