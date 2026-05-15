import chokidar, { type FSWatcher } from "chokidar";

export interface WatchProjectOptions {
  path: string;
  debounceMs?: number;
  onChange: () => void;
}

export function watchProject({
  path,
  debounceMs = 350,
  onChange
}: WatchProjectOptions): FSWatcher {
  let timer: NodeJS.Timeout | undefined;

  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(() => onChange(), debounceMs);
  };

  return chokidar.watch(path, {
    ignored: [/node_modules/, /.git/],
    ignoreInitial: true
  })
  .on("add", trigger)
  .on("change", trigger)
  .on("unlink", trigger);
}
