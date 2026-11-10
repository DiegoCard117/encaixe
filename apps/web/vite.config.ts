import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Caminhos relativos: o mesmo build serve em /encaixe/ no GitHub Pages, num fork ou na raiz de um domínio.
export default defineConfig({ base: "./", plugins: [react(), tailwindcss()] });
