const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8]
};

export function Die({ value }: { value: number }) {
  const on = new Set(PIPS[value] ?? []);
  return (
    <div className="die" aria-label={`骰子 ${value} 点`}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`cell${on.has(i) ? ' on' : ''}`} />
      ))}
    </div>
  );
}

export function DiceRow({ roll }: { roll: [number, number] | null }) {
  if (!roll) {
    return <div className="dice-hint">掷骰开始回合</div>;
  }
  return (
    <>
      <div className="dice-row">
        <Die value={roll[0]} />
        <Die value={roll[1]} />
        <span className="dice-total">{roll[0] + roll[1]} 步</span>
      </div>
      <div className="dice-hint">
        {roll[0]} + {roll[1]} = {roll[0] + roll[1]}
        {roll[0] === roll[1] ? ' · 双同点！' : ''}
      </div>
    </>
  );
}
