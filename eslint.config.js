import { defineConfig } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist", "node_modules", "traces"] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
);