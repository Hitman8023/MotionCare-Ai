/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_LLM_API_BASE_URL?: string;
	readonly VITE_GEMINI_MODEL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
