import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
// Base path is injected at build time. GitHub Actions sets
// VITE_BASE=/<repo>/ for project sites (https://<user>.github.io/<repo>/).
// Locally and for user-root sites it defaults to "/".
var base = process.env.VITE_BASE || "/";
export default defineConfig({
    base: base,
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            // Skip terser for the generated service worker: it spawns worker threads
            // that can fail in restricted build environments, and the SW is tiny.
            minify: false,
            includeAssets: ["icons/apple-touch-icon.png", "icons/favicon.svg"],
            manifest: {
                name: "Vätternrundan sub-9h",
                short_name: "Sub9",
                description: "Adaptive training plan for Vätternrundan sub-9h.",
                theme_color: "#0b1120",
                background_color: "#0b1120",
                display: "standalone",
                orientation: "portrait",
                // Relative so the installed app works under any base subpath
                // (GitHub Pages project site) as well as at the domain root.
                id: "./",
                scope: "./",
                start_url: "./",
                icons: [
                    { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
                    { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
                    {
                        src: "icons/icon-512-maskable.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "maskable",
                    },
                ],
            },
            workbox: {
                globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
                // Auto-update: new deploys take over immediately and old caches are
                // cleaned up, so the user never gets stuck on a stale cached version.
                cleanupOutdatedCaches: true,
                clientsClaim: true,
                skipWaiting: true,
            },
        }),
    ],
    server: {
        host: true,
    },
});
