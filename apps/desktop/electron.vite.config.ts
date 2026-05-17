import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const root = resolve(__dirname, "../..");
const internalPackages = [
  "@agent-workbench/core",
  "@agent-workbench/database",
  "@agent-workbench/git",
  "@agent-workbench/shared",
  "@agent-workbench/terminal",
  "@agent-workbench/types",
  "@agent-workbench/ui",
  "@agent-workbench/watcher"
];

const tsFirstExtensions = [".mts", ".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"];

export default defineConfig({
  main: {
    ssr: {
      noExternal: internalPackages
    },
    resolve: {
      extensions: tsFirstExtensions,
      alias: {
        "@agent-workbench/core": resolve(root, "packages/core/src/index.ts"),
        "@agent-workbench/database": resolve(root, "packages/database/src/index.ts"),
        "@agent-workbench/git": resolve(root, "packages/git/src/index.ts"),
        "@agent-workbench/shared": resolve(root, "packages/shared/src/index.ts"),
        "@agent-workbench/terminal": resolve(root, "packages/terminal/src/index.ts"),
        "@agent-workbench/types": resolve(root, "packages/types/src/index.ts"),
        "@agent-workbench/ui": resolve(root, "packages/ui/src/index.ts"),
        "@agent-workbench/watcher": resolve(root, "packages/watcher/src/index.ts")
      }
    }
  },
  preload: {
    ssr: {
      noExternal: internalPackages
    },
    resolve: {
      extensions: tsFirstExtensions,
      alias: {
        "@agent-workbench/shared": resolve(root, "packages/shared/src/index.ts")
      }
    }
  },
  renderer: {
    ssr: {
      noExternal: internalPackages
    },
    resolve: {
      extensions: tsFirstExtensions,
      alias: {
        "@": resolve(__dirname, "src/renderer"),
        "@agent-workbench/shared": resolve(root, "packages/shared/src/index.ts"),
        "@agent-workbench/types": resolve(root, "packages/types/src/index.ts"),
        "@agent-workbench/ui": resolve(root, "packages/ui/src/index.ts")
      }
    },
    plugins: [react()]
  }
});
