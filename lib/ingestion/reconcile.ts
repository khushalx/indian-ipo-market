export type CandidateValue<T> = {
  value: T;
  sourceId: string;
  priority: number;
  fetchedAt: string;
  verifiedAt?: string;
};

export type ReconciliationResult<T> = {
  winner: CandidateValue<T>;
  conflict?: { retained: CandidateValue<T>; rejected: CandidateValue<T> };
};

export function reconcileField<T>(current: CandidateValue<T> | undefined, incoming: CandidateValue<T>): ReconciliationResult<T> {
  if (!current) return { winner: incoming };
  const currentTime = new Date(current.verifiedAt ?? current.fetchedAt).getTime();
  const incomingTime = new Date(incoming.verifiedAt ?? incoming.fetchedAt).getTime();
  const incomingWins = incoming.priority > current.priority || (incoming.priority === current.priority && incomingTime >= currentTime);
  const winner = incomingWins ? incoming : current;
  const rejected = incomingWins ? current : incoming;
  return Object.is(current.value, incoming.value) ? { winner } : { winner, conflict: { retained: winner, rejected } };
}
