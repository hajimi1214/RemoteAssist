export type ReceiveNetworkSample = {packetLossPercent?: number; jitterMs?: number};

/** Browser hint only; the implementation may clamp or ignore this target. */
export function receiveJitterBufferTarget(gameMode: boolean, sample?: ReceiveNetworkSample): number {
  const unstable = sample && ((sample.packetLossPercent ?? 0) >= 2 || (sample.jitterMs ?? 0) >= 12);
  if (unstable) return gameMode ? 40 : 30;
  return gameMode ? 10 : 15;
}
