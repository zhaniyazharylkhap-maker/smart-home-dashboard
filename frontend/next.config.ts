import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  webpack: (config, { dev }) => {
    // In Docker, host copies could leave odd state; `/tmp` is reliably writable vs some overlay quirks.
    if (!dev && process.env.DOCKER === "true") {
      config.cache = {
        type: "filesystem",
        cacheDirectory: "/tmp/next-webpack-cache",
      };
    }
    return config;
  },
};

export default nextConfig;
