// Keep the relay's queued outgoing data bounded when a peer stops reading.
export const MAX_QUEUED_BYTES = 64 * 1024;
export function isBackpressured(bufferedAmount) {
  // Transport byte counts must be non-negative safe integers. A malformed
  // getter must never make a broken socket look safe to write to.
  return !Number.isSafeInteger(bufferedAmount) || bufferedAmount < 0 ||
    bufferedAmount > MAX_QUEUED_BYTES;
}

/** Refuse the packet that would cross the queue cap, not just later packets. */
export function wouldExceedQueue(bufferedAmount, packetBytes) {
  return !Number.isSafeInteger(packetBytes) || packetBytes < 0 ||
    isBackpressured(bufferedAmount) ||
    packetBytes > MAX_QUEUED_BYTES - bufferedAmount;
}
