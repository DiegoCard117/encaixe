import { createHash } from "node:crypto";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Política de segurança de conteúdo, só no build (o servidor de desenvolvimento injeta scripts).
 * Se algum dia uma falha permitir rodar código na página, a CSP limita o estrago: só scripts
 * do próprio site, e a página só conversa com HTTPS (provedores de LLM e Supabase) e com o
 * Ollama local. Scripts inline (o do tema) entram pelo hash.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: "encaixe-csp",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
          ([, code]) => `'sha256-${createHash("sha256").update(code!).digest("base64")}'`,
        );
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(" ")}`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'self'",
        ].join("; ");
        return html.replace(
          "<head>",
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        );
      },
    },
  };
}

// Caminhos relativos: o mesmo build serve em /encaixe/ no GitHub Pages, num fork ou na raiz de um domínio.
export default defineConfig({ base: "./", plugins: [react(), tailwindcss(), contentSecurityPolicy()] });
