import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function buildId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
});
