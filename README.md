# Zoggle
A boggle (https://en.wikipedia.org/wiki/Boggle) clone. May become something more interesting in the future.

## Gameplay
1. Timer of 60 seconds. This is configurable in code.
2. Find as many words as possible on the NxN board. N=6 for now. This should be an easy to tune value.
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
   6. Letters selected should be based on mouse hold -> path -> mouse release. All letters on the path will be checked for valid word.
   7. Score updated after each valid word selected.
3. At timer expiration, user can restart the game on the current board, or use a new board.

## Dictionary used
Start with https://github.com/matthewreagan/WebstersEnglishDictionary. Download the dictionary.json file and store it as an asset

## Board generation
1. Start with statically generated boards hardcoded in javascript.
2. Track hiscores for the current user for the current board.

## User interface
1. Clear and uncluttered UI for the current timer, current score, all-time high score for this board, current board state (letters already part of words should be highlighted differently), already selected words.
2. Keep the page clean otherwise.

## Run the tests

The tests use Node's built-in test runner, so there are no packages to install.

```sh
npm test
```

## Playtest locally

Start a local web server from the repository root:

```sh
npm start
```

Then visit [http://localhost:8000](http://localhost:8000). The page must be
served over HTTP so its JavaScript modules and dictionary asset can load. The
dictionary is about 22 MB, so the first load can take a moment.

Hold the primary mouse button (or a finger on a touch screen), trace through
neighboring tiles, and release to submit. On the initial garden board, the first
three tiles in the top row spell `CAT` and provide a quick scoring check. After
60 seconds, verify that both replaying the current board and moving to a new
board start a fresh round. Board high scores are retained in browser storage.

## Backlog
1. Dynamically generated boards.
2. For the initial prototype, everything is on the client. If we do add server support, we could add things like:
   1. Each board, dynamically or statically generated, is persisted on the server.
   2. Global hiscores for each board.
   3. Compare with friends hiscores for the board.
3. Bugs:
   1. Be more lenient when detecting traced path. Right now it's quite exact. "Round" the user's current mouse to the closest tile when tracing their path.
   2. Proper nouns like names, cities, etc. are not in the dictionary. In the canonical example, "RENO" should be accepted.
