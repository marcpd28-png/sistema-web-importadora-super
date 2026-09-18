/** Classify references without fetching customer-controlled URLs or treating a URL as visual evidence. */
export function customerSocialPlatforms(content: string): string[] {
  const platforms = new Set<string>();
  for (const match of content.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    try {
      const host = new URL(match[0]).hostname.toLowerCase();
      for (const [name, domains] of [
        ["TikTok", ["tiktok.com"]], ["Instagram", ["instagram.com"]],
        ["Facebook", ["facebook.com", "fb.watch", "fb.com"]],
        ["YouTube", ["youtube.com", "youtu.be"]], ["Pinterest", ["pinterest.com", "pin.it"]],
      ] as const) {
        if (domains.some(domain => host === domain || host.endsWith(`.${domain}`))) platforms.add(name);
      }
    } catch { /* An invalid link supplies no evidence about a product. */ }
  }
  return [...platforms];
}
