# High-density board generation

## Goal

Replace the hand-authored board list with a reproducible pool of generated 6x6
boards that offer substantially more valid choices while remaining instant to
load in the browser.

For this work, a **traceable word** is a unique playable dictionary word that
can be formed by an eight-directional path without reusing a tile within that
path. Each word is counted independently. This is deliberately distinct from
the number a player can submit in one round: the current game permanently
locks tiles after an accepted word, so no more than 12 three-letter words can
be collected from 36 tiles. “Potential score” below likewise means the sum of
each independently traceable word's value, not an attainable round score.

The current exact baselines are:

| Board | Traceable words | Potential score |
| --- | ---: | ---: |
| garden | 1,044 | 2,507 |
| seaside | 820 | 1,901 |
| night | 554 | 987 |

## Design

1. Add a pure board-generation library with:
   - a prefix trie built from the existing playable dictionary;
   - an exact DFS solver that follows the same adjacency and no-tile-reuse
     rules as gameplay and deduplicates words reached by multiple paths;
   - metrics for unique word count, potential score, longer-word counts, tile
     coverage, and a deterministic greedy estimate of tile-disjoint words;
   - a seeded pseudo-random generator and a bounded simulated-annealing search.
2. Seed each search from a constrained English-frequency letter pool. Mutations
   swap cells, preserving that pool and preventing the optimizer from
   degenerating into an unrealistic board made only of a few common letters.
   Rank candidates primarily by unique traceable words, with potential score,
   longer words, coverage, and disjoint opportunities as secondary signals.
3. Run the expensive search offline with `npm run generate:boards`. The command
   will accept fixed seed/count/evaluation settings, reject candidates below
   explicit quality floors, assign IDs from generator version plus board
   content, and write both rows and independently checkable metrics to a
   checked-in JSON asset. The same inputs must produce byte-identical output.
4. Load and validate that generated asset in `src/config.ts`; the UI will cycle
   the generated pool exactly as it cycles the static boards today. Stable
   content-derived IDs keep per-board local high scores correct. Generation is
   intentionally not run in the browser, where a useful search would cause a
   noticeable main-thread pause.
5. Add tests that:
   - prove the solver on small fixtures, including diagonals, prefix words,
     duplicate paths, and no tile reuse;
   - prove seeded generation is deterministic and always emits a valid 6x6
     uppercase board;
   - re-solve every checked-in board and verify its recorded metrics;
   - enforce quality floors above the existing pool's median, plus minimum
     longer-word, coverage, and tile-disjoint opportunity thresholds;
   - preserve replay, next-board, and stable-high-score behavior in the UI.
6. Document regeneration and quality reporting in the README, then run the
   complete test, typecheck, lint, and production-build checks.

## Acceptance criteria

- Every shipped board has at least 1,200 independently traceable words, exceeds
  the old pool's 820-word median by a comfortable margin, uses all 36 cells in
  at least one valid path, and offers at least 10 greedily selected disjoint
  words.
- The generated pool contains at least eight distinct boards and no duplicate
  layouts or IDs.
- Regenerating with the documented seed and search budget produces no diff.
- Board search remains an explicit development task; application startup and
  next-board navigation perform no stochastic optimization.

## Possible follow-ups

- Rank with a frequency-labelled common-word corpus so familiar words count
  more than obscure Webster entries.
- Revisit the cross-word tile-locking rule if conventional Boggle behavior is
  desired; doing so changes the gameplay model rather than board generation.
- If unlimited fresh boards become a requirement, move the same bounded search
  into a Web Worker and retain this checked-in pool as an immediate fallback.
