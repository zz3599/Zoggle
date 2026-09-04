interface FoundWordsProps {
  readonly words: readonly string[];
}

export function FoundWords({ words }: FoundWordsProps) {
  return (
    <aside className="words-panel" aria-labelledby="found-heading">
      <div className="words-heading">
        <h2 id="found-heading">Found words</h2>
        <span id="found-count" aria-label="number of words found">
          {words.length}
        </span>
      </div>
      <ol className="found-words">
        {words.length === 0 ? (
          <li className="empty-words">Your words will appear here.</li>
        ) : (
          [...words].reverse().map((word) => <li key={word}>{word}</li>)
        )}
      </ol>
      <ul className="scoring-note" aria-label="Scoring">
        <li>
          <span>3–4 letters</span>
          <strong>1 point</strong>
        </li>
        <li>
          <span>5 letters</span>
          <strong>2 points</strong>
        </li>
        <li>
          <span>6 letters</span>
          <strong>3 points</strong>
        </li>
        <li>
          <span>7 letters</span>
          <strong>4 points</strong>
        </li>
        <li>
          <span>8 letters</span>
          <strong>11 points</strong>
        </li>
        <li>
          <span>9+ letters</span>
          <strong>20 points</strong>
        </li>
      </ul>
    </aside>
  );
}
