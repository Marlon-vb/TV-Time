import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TV Time",
    short_name: "TV Time",
    description:
      "Track the shows you watch, see what's coming up, and catch up on episodes you've missed.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0e17",
    theme_color: "#0d0e17",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
