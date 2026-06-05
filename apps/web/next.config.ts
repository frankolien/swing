import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // @swing/shared ships raw TS (no build step) — transpile it in the app.
  transpilePackages: ["@swing/shared"],
  reactStrictMode: true,
  // monorepo root (avoid Next inferring a stray home-dir lockfile)
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
};

export default config;
