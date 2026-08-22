export interface YouTubeVideoInfo {
  videoId: string;
  provider: "YOUTUBE" | "YOUTUBE_SHORTS";
  thumbnailUrl: string;
}

export function parseYouTubeUrl(urlStr: string): YouTubeVideoInfo | null {
  const trimmed = urlStr.trim();
  if (!trimmed) return null;

  try {
    // Check protocols
    let target = trimmed;
    if (!/^https?:\/\//i.test(target)) {
      target = `https://${target}`;
    }

    const url = new URL(target);
    let videoId = "";
    let provider: "YOUTUBE" | "YOUTUBE_SHORTS" = "YOUTUBE";

    const hostname = url.hostname.replace("www.", "");

    if (hostname === "youtu.be") {
      videoId = url.pathname.slice(1);
    } else if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      if (url.pathname.startsWith("/shorts/")) {
        videoId = url.pathname.split("/")[2];
        provider = "YOUTUBE_SHORTS";
      } else if (url.pathname.startsWith("/embed/")) {
        videoId = url.pathname.split("/")[2];
      } else if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v") || "";
      }
    }

    // Remove any trailing parameters
    videoId = videoId.split("?")[0].split("&")[0].split("/")[0];

    if (!videoId || videoId.length < 5) return null;

    return {
      videoId,
      provider,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/0.jpg`,
    };
  } catch {
    return null;
  }
}
