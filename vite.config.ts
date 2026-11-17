import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Relative base so the same build works on GitHub Pages and inside a Capacitor webview.
export default defineConfig({ base: './', plugins: [preact()] });
