import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Daily Tracker",
    short_name: "Tracker",
    display: "standalone",
    start_url: "/",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
    shortcuts: [
      {
        name: "Daily Tracker",
        short_name: "DT",
        description: "Daily metrics and tracking",
        url: "/",
      },
      {
        name: "Workouts",
        short_name: "Workouts",
        description: "Log and review workouts",
        url: "/workouts",
      },
      {
        name: "Books",
        short_name: "Books",
        description: "Reading tracker",
        url: "/books",
      },
    ],
  };
}
