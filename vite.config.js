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
    build: { rollupOptions: { input: { main: "index.html", menu: "menu.html" } } },
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
