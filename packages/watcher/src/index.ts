import chokidar, { type FSWatcher } from "chokidar";

const IGNORED = /(^|[/\\])(node_modules|\.git|vendor|dist|build)([/\\]|$)/;

export interface WatchProjectOptions {
  path: string;
  debounceMs?: number;
  polling?: boolean;
  onChange: () => void;
}

export function watchProject({
  path,
  debounceMs = 350,
  polling = false,
  onChange
}: WatchProjectOptions): FSWatcher {
  let timer: NodeJS.Timeout | undefined;

  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(() => onChange(), debounceMs);
  };

  return chokidar
    .watch(path, {
      ignored: IGNORED,
      ignoreInitial: true,
      usePolling: polling,
      interval: polling ? 1000 : undefined,
      binaryInterval: polling ? 3000 : undefined
    })
    .on("add", trigger)
    .on("change", trigger)
    .on("unlink", trigger);
}
