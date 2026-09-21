/** Run independent queues even when one integration is temporarily unavailable. */
export async function runMessageWorkerCycle(jobs: Array<{ name: string; run: () => Promise<unknown> }>, onError: (name: string) => void) {
  for (const job of jobs) {
    try { await job.run(); } catch { onError(job.name); }
  }
}
