import { defineConfig, loadEnv } from "vite";
// Two pages: BlueBar itself (index.html) and the guests' online menu (menu.html, at /menu/<business>).
const menuPage = {
  name: "menu-page",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (/^\/menu(\/|$)/.test(req.url)) req.url = "/menu.html";
      next();
    });
  },
};
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [menuPage],
    build: {
      rollupOptions: {
        input: { main: "index.html", menu: "menu.html" },
        // "use client" is a React Server Components marker (motion, sonner, number-flow ship it); meaningless here.
        onwarn(warning, warn) {
          if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
        },
      },
    },
    server: {
      host: "127.0.0.1",
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${env.API_PORT || 3001}`,
          changeOrigin: true,
        },
      },
    },
  };
});
