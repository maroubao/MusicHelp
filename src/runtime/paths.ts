import path from "node:path";

export type ArtifactPaths = {
  rootDir: string;
  logsDir: string;
  reportsDir: string;
  screenshotsDir: string;
  traceDir: string;
  stateDir: string;
  qrDir: string;
};

export function resolveArtifactPaths(rootDir = "artifacts"): ArtifactPaths {
  const absoluteRoot = path.resolve(rootDir);

  return {
    rootDir: absoluteRoot,
    logsDir: path.join(absoluteRoot, "logs"),
    reportsDir: path.join(absoluteRoot, "reports"),
    screenshotsDir: path.join(absoluteRoot, "screenshots"),
    traceDir: path.join(absoluteRoot, "trace"),
    stateDir: path.join(absoluteRoot, "state"),
    qrDir: path.join(absoluteRoot, "qr-links"),
  };
}
