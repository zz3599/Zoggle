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
      <p className="scoring-note">
        3–4 letters: 1 · 5: 2 · 6: 3 · 7: 4 · 8: 11 · 9+: 20
      </p>
    </aside>
  );
}
