function requiredElement(documentRef, selector) {
  const element = documentRef.querySelector(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

function cellKey({ row, col }) {
  return `${row},${col}`;
}

function formatTime(remainingMs) {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export class GameView {
  constructor(documentRef = document) {
    this.document = documentRef;
    this.boardElement = requiredElement(documentRef, "#board");
    this.boardNameElement = requiredElement(documentRef, "#board-name");
    this.currentWordElement = requiredElement(documentRef, "#current-word");
    this.scoreElement = requiredElement(documentRef, "#score-value");
    this.highScoreElement = requiredElement(documentRef, "#high-score-value");
    this.timerElement = requiredElement(documentRef, "#timer-value");
    this.statusElement = requiredElement(documentRef, "#status");
    this.foundWordsElement = requiredElement(documentRef, "#found-words");
    this.foundCountElement = requiredElement(documentRef, "#found-count");
    this.roundActionsElement = requiredElement(documentRef, "#round-actions");
    this.retryElement = requiredElement(documentRef, "#retry-load");
    this.restartElement = requiredElement(documentRef, "#restart-board");
    this.newBoardElement = requiredElement(documentRef, "#new-board");

    this.cells = new Map();
    this.activeCells = new Set();
    this.lastFoundWordsKey = null;
  }

  renderBoard(board) {
    this.cells.clear();
    this.activeCells.clear();
    this.lastFoundWordsKey = null;
    this.boardElement.replaceChildren();
    this.boardElement.style.setProperty("--board-size", board.letters.length);
    this.boardElement.setAttribute(
      "aria-label",
      `${board.id} board, ${board.letters.length} by ${board.letters.length}`,
    );
    this.boardNameElement.textContent = `${board.id} board`;

    const fragment = this.document.createDocumentFragment();

    board.letters.forEach((row, rowIndex) => {
      row.forEach((letter, colIndex) => {
        const cell = this.document.createElement("button");
        const key = `${rowIndex},${colIndex}`;
        cell.type = "button";
        cell.className = "cell";
        cell.textContent = letter;
        cell.dataset.row = String(rowIndex);
        cell.dataset.col = String(colIndex);
        cell.setAttribute("role", "gridcell");
        cell.setAttribute(
          "aria-label",
          `${letter}, row ${rowIndex + 1}, column ${colIndex + 1}`,
        );
        this.cells.set(key, cell);
        fragment.appendChild(cell);
      });
    });

    this.boardElement.appendChild(fragment);
  }

  renderRound(snapshot) {
    this.timerElement.textContent = formatTime(snapshot.remainingMs);
    this.timerElement.classList.toggle(
      "stat-value--urgent",
      !snapshot.expired && snapshot.remainingMs <= 10_000,
    );
    this.scoreElement.textContent = String(snapshot.score);
    this.highScoreElement.textContent = String(snapshot.highScore);
    this.foundCountElement.textContent = String(snapshot.foundWords.length);

    const usedCells = new Set(snapshot.usedCells);
    for (const [key, cell] of this.cells) {
      cell.classList.toggle("cell--used", usedCells.has(key));
    }

    this.renderFoundWords(snapshot.foundWords);
    this.setBoardEnabled(!snapshot.expired);
    this.roundActionsElement.hidden = !snapshot.expired;
  }

  renderFoundWords(foundWords) {
    const wordsKey = foundWords.join("\0");
    if (wordsKey === this.lastFoundWordsKey) return;
    this.lastFoundWordsKey = wordsKey;
    this.foundWordsElement.replaceChildren();

    if (foundWords.length === 0) {
      const empty = this.document.createElement("li");
      empty.className = "empty-words";
      empty.textContent = "Your words will appear here.";
      this.foundWordsElement.appendChild(empty);
      return;
    }

    const fragment = this.document.createDocumentFragment();
    [...foundWords].reverse().forEach((word) => {
      const item = this.document.createElement("li");
      item.textContent = word;
      fragment.appendChild(item);
    });
    this.foundWordsElement.appendChild(fragment);
  }

  renderSelection(word, path) {
    const nextActiveCells = new Set(path.map(cellKey));

    for (const key of this.activeCells) {
      if (!nextActiveCells.has(key)) {
        this.cells.get(key)?.classList.remove("cell--active");
      }
    }
    for (const key of nextActiveCells) {
      this.cells.get(key)?.classList.add("cell--active");
    }

    this.activeCells = nextActiveCells;
    this.currentWordElement.textContent = word ? word.toUpperCase() : "—";
  }

  clearSelection() {
    this.renderSelection("", []);
  }

  setBoardEnabled(enabled) {
    this.boardElement.setAttribute("aria-disabled", String(!enabled));
    this.boardElement.classList.toggle("board--disabled", !enabled);
    for (const cell of this.cells.values()) cell.disabled = !enabled;
  }

  setStatus(message, tone = "neutral") {
    this.statusElement.textContent = message;
    this.statusElement.dataset.tone = tone;
  }

  showLoading() {
    this.setBoardEnabled(false);
    this.roundActionsElement.hidden = true;
    this.retryElement.hidden = true;
    this.setStatus("Loading Webster’s dictionary…");
  }

  showLoadError() {
    this.setBoardEnabled(false);
    this.retryElement.hidden = false;
    this.setStatus(
      "The dictionary could not be loaded. Check the server and try again.",
      "error",
    );
  }

  showReady() {
    this.retryElement.hidden = true;
    this.setStatus("Hold and drag across neighboring letters to make a word.");
  }

  onRestart(handler) {
    this.restartElement.addEventListener("click", handler);
  }

  onNewBoard(handler) {
    this.newBoardElement.addEventListener("click", handler);
  }

  onRetry(handler) {
    this.retryElement.addEventListener("click", handler);
  }
}

