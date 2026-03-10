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
        icons: [{ src: "/icons/shortcut-dt.svg", sizes: "96x96", type: "image/svg+xml" }],
      },
      {
        name: "Workouts",
        short_name: "Workouts",
        description: "Log and review workouts",
        url: "/workouts",
        icons: [{ src: "/icons/shortcut-workouts.svg", sizes: "96x96", type: "image/svg+xml" }],
      },
      {
        name: "Books",
        short_name: "Books",
        description: "Reading tracker",
        url: "/books",
        icons: [{ src: "/icons/shortcut-books.svg", sizes: "96x96", type: "image/svg+xml" }],
      },
      {
        name: "Food Log",
        short_name: "Food",
        description: "Food and nutrition log",
        url: "/food",
        icons: [{ src: "/icons/shortcut-food.svg", sizes: "96x96", type: "image/svg+xml" }],
      },
    ],
  };
}
