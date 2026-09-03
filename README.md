# Zoggle

A browser-based [Boggle](https://en.wikipedia.org/wiki/Boggle) clone built with
React 19, TypeScript, and Vite.

## Gameplay
1. Timer of 60 seconds. This is configurable in code.
2. Find as many words as possible on the NxN board. N=6 for now. This is easy to tune in TypeScript.
   1. Words must be at least 3 letters long and exist in the dictionary.
   2. Each letter after the first must be a horizontal, vertical, or diagonal neighbor of the one before it.
   3. No capitalized (e.g., acronyms) or hyphenated words are allowed.
   4. No individual tile may be used more than once in a round. UI should make this clear.
   5. Scoring:

      1. 3-4 letters: 1 point
      2. 5 letters: 2 points
      3. 6 letters: 3 points
      4. 7 letters: 4 points
      5. 8 letters: 11 points
      6. 9+ letters: 20 points

   6. Letters are selected by holding a mouse button or finger, tracing a path,
      and releasing. Horizontal and vertical gaps use nearest-tile snapping;
      diagonal paths require an exact tile hit to avoid selecting a side tile.
   7. Score updated after each valid word selected.
3. The user can play the current board again at any time. At timer expiration,
   they can also start a new board.

## Dictionary used
The app uses the
[Webster's English Dictionary](https://github.com/matthewreagan/WebstersEnglishDictionary)
data stored in `assets/dictionary.json`. The file is about 22 MB, so its first
load can take a moment.

## Board generation
1. Boards are currently defined statically in `src/config.ts`.
2. High scores are stored locally per board.

## User interface
1. Clear and uncluttered UI for the current timer, current score, all-time high score for this board, current board state (letters already part of words should be highlighted differently), already selected words.
2. Keep the page clean otherwise.

## Development

Use Node 24 or newer (Node 22.13+ is also supported), then install dependencies:

```sh
npm install
```

Start the Vite development server:

```sh
npm run dev
```

Then visit [http://localhost:5173](http://localhost:5173).

Run the automated checks with:

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Use `npm run preview` to serve the production build locally.

## Architecture

- `src/App.tsx` composes the game interface from focused React components.
- `src/hooks/` owns dictionary loading, round timing, and pointer-controller
  lifecycles.
- `src/game-state.ts`, `src/rules.ts`, and `src/selection.ts` contain the typed,
  framework-independent game logic.
- `tests/` contains Vitest unit and React Testing Library integration tests.

## Manual playtesting

Hold the primary mouse button (or a finger on a touch screen), trace through
neighboring tiles, and release to submit. On the initial garden board, the first
three tiles in the top row spell `CAT` and provide a quick scoring check. Before
time runs out, select Play again and verify that the current board starts a
fresh 60-second round. After time expires, verify that moving to a new board
also starts a fresh round. Board high scores are retained in browser storage.

## Coding style
Follow https://www.conventionalcommits.org/en/v1.0.0/ for commit messages. Each commit should be small and do one specific thing.

## Backlog

1. Dynamically generated boards.
2. For the initial prototype, everything is on the client. If we do add server support, we could add things like:
   1. Each board, dynamically or statically generated, is persisted on the server.
   2. Global hiscores for each board.
   3. Compare with friends hiscores for the board.
3. Add selected proper nouns such as names and cities that are absent from the
   source dictionary. In the canonical example, `RENO` should be accepted.
