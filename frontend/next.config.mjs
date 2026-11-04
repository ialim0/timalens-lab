// The app is exported as static files that the FastAPI server serves (one container, one
// origin: the API and Tima's WebSocket live next to the pages). In development, `next dev`
// forwards /api and /samples to the FastAPI server.
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const API = process.env.API_URL ?? "http://localhost:8080";

export default function config(phase) {
  const base = {
    reactStrictMode: true,
    images: { unoptimized: true },
    poweredByHeader: false,
  };
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      ...base,
      async rewrites() {
        return [
          { source: "/api/:path*", destination: `${API}/api/:path*` },
          { source: "/samples/:path*", destination: `${API}/samples/:path*` },
        ];
      },
    };
  }
  return { ...base, output: "export" };
}
