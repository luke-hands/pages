# AGENTS.md — luke-hands/pages

This repo is a gallery of small, self-contained browser toys and games,
published via GitHub Pages at https://luke-hands.github.io/pages/.

## Structure

- Each idea lives in its own folder: `/<slug>/index.html`.
- It is served live at `https://luke-hands.github.io/pages/<slug>/`.
- The root `index.html` is the gallery. When you add a new toy, add a
  linked card for it there (title + one-line description + link to `/<slug>/`).
  (The root page is currently a coming-soon placeholder — convert it into
  the gallery when the first toy lands.)

## Rules for each toy

- Fully self-contained: inline CSS/JS or local files in the same folder.
- No build step, no framework, no npm. Vanilla JS unless I say otherwise.
- CDN links are fine (e.g. cdnjs); no bundlers.
- Mobile-friendly and works from a `file://` open with no server.
- Never commit secrets, keys, or analytics IDs.

## Commits

- One folder per PR. Keep the diff scoped to the new toy + the gallery card.
