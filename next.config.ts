import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Drafting reads this file at runtime on every generation (D27).
  outputFileTracingIncludes: {
    "/*": ["./config/email_template.json"],
  },
  async redirects() {
    return [{ source: "/", destination: "/leads", permanent: false }];
  },
};

export default nextConfig;
