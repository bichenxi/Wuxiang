import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { agentDevPlugin } from "@wuxiang/agent/vite";

const projectRoot = new URL("../../", import.meta.url).pathname;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, "");
  return {
    root: new URL("./", import.meta.url).pathname,
    plugins: [
      react(),
      agentDevPlugin({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL
      })
    ],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true
    }
  };
});
