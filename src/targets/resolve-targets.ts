import type { AppConfig } from "../config/schema.js";
import type { PlaybackPlan, TrackTarget } from "../runtime/types.js";

function singleTrack(track: { name: string; url: string }, source: TrackTarget["source"]): TrackTarget {
  return {
    name: track.name,
    url: track.url,
    source,
  };
}

export function resolveTargets(config: AppConfig): PlaybackPlan {
  switch (config.targets.mode) {
    case "song":
      return {
        mode: "song",
        loopMode: config.playback.loop_mode,
        queue: [singleTrack(config.targets.song!, "song")],
      };
    case "songs":
      return {
        mode: "songs",
        loopMode: config.playback.loop_mode,
        queue: config.targets.songs!.map((track) => singleTrack(track, "songs")),
      };
    case "playlist":
      return {
        mode: "playlist",
        loopMode: config.playback.loop_mode,
        queue: [singleTrack(config.targets.playlist!, "playlist")],
      };
  }
}
