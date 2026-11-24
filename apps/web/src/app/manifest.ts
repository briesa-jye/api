import type { MetadataRoute } from "next";

/** Lets staff add the Quick check page to their Dock or home screen as its own window. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Briesa Quick check", short_name: "Quick check", description: "Run a compliance check and keep an audit trail.",
    start_url: "/check", scope: "/", display: "standalone", background_color: "#0b0b0f", theme_color: "#0b0b0f",
    icons: [{ src: "/images/logos/icon-light-512-isolated.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
