# High-density board generation

## Goal

Replace the hand-authored board list with a reproducible pool of generated 6x6
boards that offer substantially more valid choices while remaining instant to
load in the browser.

For this work, a **traceable word** is a unique playable dictionary word that
can be formed by an eight-directional path without reusing a tile within that
path. Each word is counted independently. This is deliberately distinct from
the number a player can submit in one Classic round: Classic permanently locks
tiles after an accepted word, so no more than 12 three-letter words can
be collected from 36 tiles. “Potential score” below likewise means the sum of
each independently traceable word's value, not an attainable round score.

The current exact baselines are:

| Board | Traceable words | Potential score |
| --- | ---: | ---: |
| garden | 1,044 | 4,563 |
| seaside | 820 | 3,398 |
| night | 554 | 1,624 |

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
   content-derived IDs keep per-board local high scores correct. Checked-in-pool
   generation is intentionally not run automatically in the browser, where a
   useful search on the main thread would cause a noticeable pause.
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
- Checked-in-pool search remains an explicit development task; application
  startup and saved-board navigation perform no stochastic optimization.

## Implemented follow-up

- The main page can now generate fresh boards on demand. The bounded search runs
  in a Web Worker and retains the checked-in pool as an immediate fallback.
- Endless mode now removes accepted paths, compacts each column under gravity,
  and spawns weighted letters at the top without running an expensive board
  search during play. Newly formed words resolve in bounded longest-first
  cascades with a seven-letter readability cap.

## Theme-based generated boards

### Goal

Allow `scripts/generate-boards.mts` to accept an optional `theme: string`
(`--theme <value>`) and generate a board rich in words related to that theme.
The same starting board should remain useful in both Classic and Endless while
retaining the current general word-density and playability floors. Unthemed
generation must remain backward compatible.

A **themed word** is a playable dictionary word selected by a reproducible
theme profile, rather than a word inferred from the theme string during every
board evaluation. Classic success means producing many tile-disjoint themed
opportunities because accepted paths lock. Endless success means continuing to
surface new themed words after replenishment; an infinite board has no single
static maximum, so measure it over deterministic, fixed-length rollouts.

### Building a `ThemeProfile`

Build the profile once, before evaluating any board. The board generator should
consume a frozen semantic input and must never ask a model or reinterpret
dictionary definitions inside the annealing loop.

1. Canonicalize the request with Unicode NFKC normalization, lowercase, trimmed
   and collapsed whitespace, while retaining the original text for display.
   Reject empty, control-heavy, or unreasonably long themes. Use a
   collision-safe cache key such as a readable slug plus the first bytes of a
   SHA-256 of the normalized theme.
2. Produce candidate concepts through a versioned `ThemeWordResolver`. Start
   with exact theme terms and reviewed include/exclude/alias overrides, then use
   a structured model-assisted snapshot to propose single-word English lemmas
   in `core`, `strong`, and `related` tiers. A deterministic search over source
   headwords and definitions can provide lower-weight supporting evidence, but
   plain definition substring matches must not establish membership because
   the dictionary is polysemous and contains noisy examples and cross-references.
   The resolver proposes candidates only; it never decides what is playable.
3. Ground every candidate in the local data. Require a matching source
   headword and at least one form in `assets/playable-words.json`; discard model
   inventions, phrases, punctuation, capitalization, and unsupported proper
   nouns. Build a versioned lemma-to-surface-form index from attested source
   entries rather than inventing inflections. For an ambiguous surface form,
   keep the highest-weight source with a stable lemma/POS tie breaker rather
   than adding weights together.
4. Convert evidence to versioned integer weights so ordering never depends on
   floating-point or provider-specific confidence values. Give direct/core
   lemmas the highest tier, cap model and definition-retrieval evidence below
   that tier, and apply a fixed discount to derived inflections. Store the lemma
   family for every surface word and cap each family's aggregate contribution;
   otherwise a root with many inflections can overwhelm a genuinely broader
   theme. Report both unique surface words and unique lemma families.
5. Reject a weak profile before board search. Versioned gates should cover the
   number of grounded lemma families and playable forms, useful word-length
   distribution, total weight, and the maximum share contributed by one family
   or evidence source. Print accepted/rejected candidate counts and the top
   weighted families so a maintainer can review surprising or overly obscure
   results. Explicit includes that cannot be grounded should be errors rather
   than silently disappearing.
6. Derive the 36-letter board pool from family-balanced letter mass. Give each
   lemma family a bounded total contribution, divide it among its surface forms,
   and normalize each word by length before counting letters. As an initial
   versioned recipe, apportion 22 slots from `DEFAULT_LETTER_POOL` and 14 from
   theme mass using largest-remainder rounding with alphabetical tie breaks.
   Mark one to three high-confidence words as anchors and deterministically
   repair the allocation so their required letter multiplicities are possible;
   this prevents rounding from making a target such as `jazz` impossible.
   Enforce vowel and repeated-letter bounds, require exactly 36 uppercase ASCII
   letters, and record how many profile words and how much profile weight the
   resulting multiset can support. Tune the blend only by changing a recorded
   pool-recipe version and comparing cross-theme benchmarks.
7. Serialize a compact, canonical profile containing:

   - format, resolver, weighting, and pool-recipe versions;
   - original and normalized theme plus its cache key;
   - digests of the normalized source data, playable words, curated overrides,
     and any model-produced candidate snapshot;
   - sorted word records with `word`, `lemma`, relation tier, integer weight,
     derivation, and evidence source;
   - anchor words, A-Z letter weights, the final 36-letter pool, validation
     statistics, and a profile digest.

   Sort all records and omit timestamps. Compute the profile SHA-256 over the
   canonical payload without its own digest so input order and JSON whitespace
   cannot change the result.
8. Make profile creation an explicit, reviewable phase such as
   `npm run generate:theme-profile -- --theme "outer space"`, writing
   `assets/theme-profiles/<theme-key>.json`.
   `npm run generate:boards -- --theme "outer space"` should only load and
   validate that snapshot. A missing profile, changed dictionary digest, or
   mismatched normalized theme should fail with the exact regeneration command;
   model/network work must never happen implicitly. Allow an explicit
   `--theme-profile <path>` for fixtures and experiments, and include the
   profile digest in every themed board seed.

### Design

1. Implement the profile builder and loader as a module separate from board
   solving so semantic resolution, dictionary grounding, pool derivation, and
   deterministic board optimization can be tested independently.
2. Add `theme` to the generator options and CLI. Include the normalized theme in
   per-board seeds and labels, and persist the profile digest, actual letter
   pool, resolver/strategy versions, and themed metrics in a versioned generated
   artifact. A run without `theme` should retain the existing artifact behavior.
3. Extend board analysis with themed word count and score, long-word and cell
   coverage, and mode-specific opportunity metrics. Keep whole-dictionary
   metrics as quality floors, then rank qualifying candidates by themed
   results. Derive a 36-letter pool by blending theme-word frequencies with the
   default English pool; swap-only search cannot otherwise introduce letters
   that are rare or absent from the current pool.
4. Score Classic with a deterministic packing of tile-disjoint themed paths,
   including alternate paths for words longer than three letters. Optimize the
   attainable themed count and score, not only the number of independently
   traceable words, and retain coverage/path-diversity tie breakers so one
   heavily shared letter cluster does not dominate the result.
5. Put Endless top-spawn selection behind a `TileSpawnStrategy` interface. Give
   a strategy the current board, removed cells, theme profile/trie,
   already-found words, a seeded random source, and a strict work budget. Keep
   today's English-frequency sampler as the unthemed fallback, then benchmark:

   - sampling from a theme-weighted pool;
   - neighbor-aware or n-gram-weighted sampling;
   - targeting an unseen themed word that can cross the replaced cells; and
   - sampling a bounded set of fills and choosing the one that creates the most
     unseen themed words according to the small theme trie.

   Gravity must still preserve survivor order, spawn only at the top,
   and complete within a small synchronous latency budget. If lookahead cannot
   meet that budget, precompute hints or move it to a worker rather than running
   full-board annealing during submission.
6. Carry the theme and replacement profile through `BoardDefinition`, config,
   `useGame`, and, if interactive themed generation is in scope, the fresh-board
   worker request. Include the theme/profile/strategy version in board identity
   or high-score keys because the same layout can produce a different Endless
   game under a different refill policy.
7. Add profile tests proving that equivalent normalized themes and reordered
   candidate input produce the same digest, source/dictionary changes invalidate
   it, ambiguous inflections resolve consistently, anchors survive allocation,
   and the pool contains exactly 36 valid letters. Also test CLI validation,
   sparse themes, themed metrics, Classic disjoint packing, and every
   spawn-strategy contract. Re-solve checked-in themed artifacts, prove that
   columns compact correctly, exclude already-found words from cascade
   scoring, and preserve every existing unthemed test. Document theme
   resolution, regeneration, metrics, and artifact provenance in the README.

### Evaluation and acceptance

- The same theme, profile, seed, and search budget produce byte-identical output;
  semantic resolution is never performed in the gameplay path.
- Across a small fixture set of themes with different letter distributions,
  themed generation beats an unthemed-board baseline for traceable themed words
  and Classic tile-disjoint themed opportunities without violating general
  quality floors.
- Seeded Endless rollouts report new unique themed words available after each
  gravity cycle and beat the existing random-spawn baseline over a fixed number
  of turns. Record both yield and worst-case spawn latency so quality does not
  come at the cost of responsive play.

## Possible follow-ups

- Rank with a frequency-labelled common-word corpus so familiar words count
  more than obscure dictionary entries.
- Revisit Classic's cross-word tile-locking rule if conventional Boggle
  behavior is desired; doing so changes the gameplay model rather than board
  generation.
