# Zoggle

A browser-based [Boggle](https://en.wikipedia.org/wiki/Boggle) clone built with
React 19, TypeScript, and Vite.

## Gameplay

Zoggle has two modes, selected from the prominent control beside the title:

- **Classic** locks every tile used in an accepted word for the rest of the
  round.
- **Endless** immediately replaces the tiles in an accepted word and leaves
  those positions available for another word. Replacement letters are chosen
  from the same English-frequency pool used to seed generated boards, with a
  different letter preferred at each position.

Both modes share these rules:

1. Timer of 60 seconds. This is configurable in code.
2. Find as many words as possible on the NxN board. N=6 for now. This is easy to tune in TypeScript.
   1. Words must be at least 3 letters long and exist in the dictionary.
   2. Each letter after the first must be a horizontal, vertical, or diagonal neighbor of the one before it.
   3. No capitalized (e.g., acronyms) or hyphenated words are allowed.
   4. No individual tile may be used more than once within one word.
   5. Scoring:

      1. 3-4 letters: 1 point
      2. 5 letters: 2 points
      3. 6 letters: 3 points
      4. 7 letters: 4 points
      5. 8 letters: 11 points
      6. 9+ letters: 20 points

   6. Letters are selected by holding a mouse button or finger, tracing a path,
      and releasing. A tile is added only while the pointer is inside its
      centered hit box, which spans 80% of the tile's width and height.
   7. Score updated after each valid word selected.
3. The user can play the current board again at any time. At timer expiration,
   they can also start a new board.

## Dictionary used
The app combines
[Webster's English Dictionary](https://github.com/matthewreagan/WebstersEnglishDictionary)
from `assets/dictionary.json` with the
[an-array-of-english-words](https://github.com/words/an-array-of-english-words)
word-game list, which is derived from Letterpress. Webster supplies headwords
but omits most inflections. During generation, a WordNet-aware lemmatizer keeps
the supplement's verified surface spellings whose base form is in Webster,
including `caters` and irregular forms. `npm run generate:dictionary` builds
the compact `assets/playable-words.json` file consumed by the app. Third-party
notices are preserved in `public/THIRD_PARTY_NOTICES.txt`.

## Board generation

Boards are selected from a checked-in, reproducible pool in
`assets/generated-boards.json`. Each candidate is solved exactly against the
playable dictionary, then a seeded simulated-annealing search rearranges a
fixed English-frequency letter pool to increase the number of unique words.
The checked-in pool is generated offline, so application startup and saved-board
navigation remain instant. The **Generate fresh board** action runs an independent
bounded search in a Web Worker. It keeps the current round available while it
searches, enforces the same quality floors, avoids saved layouts and boards
generated earlier in the current page session, and starts a new round only after
a valid board is ready.

Regenerate the default eight-board pool with:

```sh
npm run generate:boards
```

The command uses a fixed seed and evaluation budget, records independently
checkable quality metrics, and rejects boards below the checked-in word-count,
potential-score, long-word, cell-coverage, and tile-disjoint thresholds. The
same dictionary and options produce byte-identical output. Use `-- --help` to
see optional seed, count, evaluation-budget, and output arguments. Regenerate
the dictionary first if its source data changes. Potential score is the sum of
all independently traceable words' values; in Classic, accepted words lock
their tiles, so it is a comparison metric rather than an attainable round
score.

Endless refills deliberately do not run the full solver or annealing search in
the gameplay path. They sample only the played positions from the same weighted
letter pool, making the work proportional to word length and keeping each
refill instant. High scores are stored locally per board and mode using stable
IDs derived from the generator version and starting layout.

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
- `src/board-generation.ts` contains the exact board solver, quality analysis,
  and deterministic search used by the offline generator.
- `src/endless-board.ts` contains the bounded, immutable Endless tile-refill
  logic.
- `src/generate-board.worker.ts` runs opt-in fresh-board searches away from the
  browser's main thread.
- `src/hooks/` owns dictionary loading, round timing, and pointer-controller
  lifecycles.
- `src/game-state.ts`, `src/rules.ts`, and `src/selection.ts` contain the typed,
  framework-independent game logic.
- `tests/` contains Vitest unit and React Testing Library integration tests.

## Manual playtesting

Hold the primary mouse button (or a finger on a touch screen), trace through
neighboring tiles, and release to submit. On board 1 of the default generated
pool, row 2 column 2 through row 2 column 3 and then row 3 column 2 spell `CAT`
and provide a quick scoring check. In Classic, verify those tiles become
unavailable. Switch to Endless, submit a word, and verify its positions animate
in with new letters and remain available. Switching modes starts a clean round,
and Play again restores the starting board. After time expires, verify that
moving to a new board also starts a fresh round. Board-and-mode high scores are
retained in browser storage.

Use **Generate fresh board** to search for a new layout that is not in the
checked-in pool. The current board remains playable while the search runs, and
the generation can be cancelled without losing the current round.

## Coding style
Follow https://www.conventionalcommits.org/en/v1.0.0/ for commit messages. Each commit should be small and do one specific thing.

## Backlog

1. For the initial prototype, everything is on the client. If we do add server support, we could add things like:
   1. Each board, dynamically or statically generated, is persisted on the server.
   2. Global hiscores for each board.
   3. Compare with friends hiscores for the board.
2. Add selected proper nouns such as names and cities that are absent from the
   source dictionary. In the canonical example, `RENO` should be accepted.
