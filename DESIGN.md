<!--
  SPDX-FileCopyrightText: 2026 PsycheSeek Contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

# Design — PsycheSeek

PsycheSeek uses a flat **"neon-wire" cyberpunk** aesthetic: ink-black surfaces, a
faint violet grid and layered glow, with two neon accents used sparingly against
the dark. The canary mascot survives as a small gold accent — the animated
equalizer beside the now-playing track is its "song."

## Palette

<p>
  <img alt="Ink #07070E"     src="https://img.shields.io/badge/ink-07070E-07070E?style=flat-square&labelColor=07070E">
  <img alt="Magenta #FF2E97" src="https://img.shields.io/badge/magenta-FF2E97-FF2E97?style=flat-square&labelColor=FF2E97">
  <img alt="Cyan #23E0E6"    src="https://img.shields.io/badge/cyan-23E0E6-23E0E6?style=flat-square&labelColor=23E0E6">
  <img alt="Violet #9B7BFF"  src="https://img.shields.io/badge/violet-9B7BFF-9B7BFF?style=flat-square&labelColor=9B7BFF">
  <img alt="Canary #FFD23F"  src="https://img.shields.io/badge/canary-FFD23F-FFD23F?style=flat-square&labelColor=FFD23F">
</p>

| Token   | Hex       | Role |
| ------- | --------- | ---- |
| Ink     | `#07070E` | Base background |
| Magenta | `#FF2E97` | Primary accent — active nav, primary actions, now-playing |
| Cyan    | `#23E0E6` | Secondary accent — focus, links, downloads |
| Violet  | `#9B7BFF` | Connective mid-tone — tree lines, gradients |
| Canary  | `#FFD23F` | The mascot's "song" — the now-playing equalizer |

Text tiers run from `#ECEBF6` (primary) through `#A5A3C8` and `#6F6D97`
(muted / dim) for a legible hierarchy on the dark base.

## Typography

| Family | Role |
| ------ | ---- |
| [Chakra Petch](https://fonts.google.com/specimen/Chakra+Petch) | Display — brand wordmark, headings |
| [Sora](https://fonts.google.com/specimen/Sora) | Body / UI — **including all file names and filesystem paths** |
| [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) | Log/console output only. **Not** for file metadata (sizes, bitrates, timestamps) and **never** file names or paths — those use the body font |

## Buttons

All buttons share the same geometry — small radius (`--r-sm`), 8×14px padding, or a
34×34px square for icon-only buttons (`.icon-button`) — and differ only in outline
and accent color, which encode intent:

| Style | Class | Look | Use for |
| ----- | ----- | ---- | ------- |
| Default | (any `button`) | Soft glass fill (`--surface-2`), violet hairline border, muted text; on hover the border and text turn cyan together with a soft glow and a 1px lift | Everything unless another row applies — form submits, toolbar actions, item-level operations |
| Primary | `.primary-button` | Filled magenta gradient, dark text, magenta glow | The single most important action of a view; use sparingly |
| Outline | `.outline-button` | Transparent, magenta border and text | Prominent actions tied to the primary accent (e.g. play) |
| Danger | `.danger-button` | Transparent, red border and text; red-tinted hover glow | Destructive confirmations — the Delete button in a modal |
| Ghost / secondary | `.ghost-button`, `.secondary-button` | Transparent, faint violet hairline, muted text; cyan on hover | Quiet auxiliary actions — dismiss, cancel |
| Link | `.link-button` | Borderless cyan text | Inline navigation that reads as a link (usernames, breadcrumbs) |

Rules of thumb:

- **Default first.** Most buttons are the quiet default style; reach for an accented
  variant only when the action's role demands it, and use at most one primary per view.
- **Item-level actions are icon-only squares** (`.icon-button` + a color class above)
  with a `data-tooltip` and `aria-label`; no text labels on repeated row controls.
- **Color encodes severity, not decoration:** cyan = safe/standard, red = destructive,
  magenta = primary/emphasis. A row of actions should read mostly quiet, with color
  only where intent differs.
- **On hover, the outline and the icon/text are the same color.** A hovered button
  brightens as one unit — border and content shift together to the soft tint of its
  accent (e.g. magenta → magenta-soft), never border in one color and icon in another.

## Principles

- **Flat, not skeuomorphic.** Depth comes from layered translucent surfaces, a fine
  grid, and soft neon glow — never bevels or drop-shadowed cards.
- **Neon is a scalpel.** Magenta and cyan mark active / focus / now-playing states;
  most of the UI stays quiet ink and muted violet-grey.
- **Motion on the moments that matter.** A staggered page-load reveal, the
  folder-open animation in the file tree, and hover/focus glows — not motion
  everywhere.
- **Metadata stays in the body font.** Sizes, bitrates, durations and timestamps are
  set in Sora like the rest of the UI, one text tier dimmer than their subject;
  monospace is reserved for log/console output. Column headers are uppercase and
  letter-spaced, and file names and paths always use the body font, even inside the
  file tree.
- **User data is framed.** Values the user provided or can edit — paths above all —
  are shown inside outlined field-style boxes (border + faint surface), so they
  read as editable data rather than static labels. Plain text is for our copy;
  boxed text is for theirs.
- **Row actions are icons.** Per-item actions (change folder, add, remove) are
  icon-only square buttons aligned to the right of the value they act on — no text
  labels on repeated row controls.
- **Destructive actions confirm.** Removing a share, deleting a file, or any
  irreversible action opens a confirmation modal before it takes effect.

The design tokens live in [`psyche-seek/src/index.css`](psyche-seek/src/index.css).
