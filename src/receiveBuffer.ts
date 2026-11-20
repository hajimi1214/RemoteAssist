export type ReceiveNetworkSample = {packetLossPercent?: number; jitterMs?: number};

/** Browser hint only; the implementation may clamp or ignore this target. */
export function receiveJitterBufferTarget(gameMode: boolean, sample?: ReceiveNetworkSample): number {
  if (!gameMode) return 30;
  return sample && ((sample.packetLossPercent ?? 0) >= 2 || (sample.jitterMs ?? 0) >= 12) ? 45 : 20;
}
