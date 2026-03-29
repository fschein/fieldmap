import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,

  // REMOVIDO: extendDefaultRuntimeCaching: true
  // O cache padrão do next-pwa inclui regras que cacheiam respostas de
  // navegação com StaleWhileRevalidate — isso faz tokens expirados e
  // erros 401 do Supabase ficarem cacheados e o app travar.

  runtimeCaching: [
    // Supabase — NetworkFirst com timeout generoso para conexões lentas de campo
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "supabase-api",
        networkTimeoutSeconds: 15, // era 5 — muito curto para mobile em campo
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 2, // 2h — era 24h, muito longo para dados de auth
        },
        cacheableResponse: {
          statuses: [200], // REMOVIDO o status 0 (opaque responses do Supabase não devem ser cacheadas)
        },
      },
    },

    // APIs locais — NetworkFirst, sem cachear erros
    {
      urlPattern: /\/api\/.*$/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "local-api",
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 60 * 60 * 2,
        },
        cacheableResponse: {
          statuses: [200], // só cacheia sucesso
        },
      },
    },

    // Assets estáticos — CacheFirst é seguro aqui pois têm hash no nome
    {
      urlPattern: /\/_next\/static\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "next-static",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 30,
        },
      },
    },

    // Imagens — CacheFirst com expiração razoável
    {
      urlPattern: /\/_next\/image\?.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "next-image",
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 60 * 60 * 24 * 7,
        },
      },
    },

    // Páginas HTML — NetworkFirst para garantir sempre o conteúdo mais recente
    // Nunca usar StaleWhileRevalidate em páginas que dependem de autenticação
    {
      urlPattern: /^https?:\/\/.*\/dashboard.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "dashboard-pages",
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 16,
          maxAgeSeconds: 60 * 60 * 24,
        },
        cacheableResponse: {
          statuses: [200],
        },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    turbopack: {},
  },
};

export default withPWA(nextConfig);
