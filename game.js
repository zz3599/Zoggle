const board = [
  ["C", "A", "T", "S"],
  ["R", "E", "L", "O"],
  ["D", "N", "P", "I"],
  ["G", "M", "A", "T"]
];

const boardElement = document.getElementById("board");

board.forEach((row, rowIndex) => {
  row.forEach((letter, colIndex) => {
    const cell = document.createElement("button");

    cell.textContent = letter;
    cell.className = "cell";

    cell.dataset.row = rowIndex;
    cell.dataset.col = colIndex;

    boardElement.appendChild(cell);
  });
});