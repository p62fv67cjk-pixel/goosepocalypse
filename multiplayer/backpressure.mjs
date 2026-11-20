// Keep the relay's queued outgoing data bounded when a peer stops reading.
export const MAX_QUEUED_BYTES = 64 * 1024;
export function isBackpressured(bufferedAmount) {
  return !Number.isFinite(bufferedAmount) || bufferedAmount > MAX_QUEUED_BYTES;
}

/** Refuse the packet that would cross the queue cap, not just later packets. */
export function wouldExceedQueue(bufferedAmount, packetBytes) {
  return !Number.isFinite(packetBytes) || packetBytes < 0 ||
    isBackpressured(bufferedAmount) ||
    bufferedAmount + packetBytes > MAX_QUEUED_BYTES;
}
