import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // OAuth discovery documents must live under /.well-known, which the App
    // Router will not serve from a dotted directory. RFC 9728 clients also
    // probe a path-suffixed form (e.g. /.well-known/oauth-protected-resource/api/mcp),
    // so both shapes are mapped onto the same handler.
    return [
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/oauth/protected-resource",
      },
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: "/api/oauth/protected-resource",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/oauth/authorization-server",
      },
      {
        source: "/.well-known/oauth-authorization-server/:path*",
        destination: "/api/oauth/authorization-server",
      },
      {
        // Some clients probe the OpenID discovery path before the OAuth one.
        source: "/.well-known/openid-configuration",
        destination: "/api/oauth/authorization-server",
      },
    ];
  },
};

export default nextConfig;
