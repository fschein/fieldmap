/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    // SHA do commit do deploy atual (Vercel já injeta isso no build) — usado
    // pra comparar a versão do bundle carregado contra a do servidor.
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now()),
  },
}

module.exports = nextConfig