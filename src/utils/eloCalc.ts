const K = 32;

export function calcExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function calcNewRating(rating: number, expected: number, score: number): number {
  return Math.round(rating + K * (score - expected));
}

export function applyEloResult(
  winnerElo: number,
  loserElo: number
): { newWinnerElo: number; newLoserElo: number } {
  const eW = calcExpectedScore(winnerElo, loserElo);
  const eL = calcExpectedScore(loserElo, winnerElo);
  return {
    newWinnerElo: calcNewRating(winnerElo, eW, 1),
    newLoserElo: calcNewRating(loserElo, eL, 0),
  };
}
