export interface TestBotRatingEvent {
  id: string;
  sessionId: string;
  rating: number;
  createdAt: string;
}

const ratings: TestBotRatingEvent[] = [];

export function recordTestBotRating(sessionId: string, rating: number) {
  ratings.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    rating,
    createdAt: new Date().toISOString(),
  });
}

export function getTestBotEvaluationMetrics() {
  const totalRatings = ratings.length;
  const averageRating = totalRatings
    ? Number((ratings.reduce((sum, item) => sum + item.rating, 0) / totalRatings).toFixed(2))
    : 0;
  const latestRatings = [...ratings]
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
    .slice(0, 10);

  return {
    totalRatings,
    averageRating,
    latestRatings,
  };
}
