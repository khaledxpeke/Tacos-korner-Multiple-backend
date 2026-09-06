import path from "path";

/**
 * Repo root whether the process is running from src/ (tsx) or dist/ (compiled).
 * Both trees are one level under the project root.
 */
export const PROJECT_ROOT = path.resolve(__dirname, "../..");

export const paths = {
  translations: path.join(PROJECT_ROOT, "translations"),
  template: path.join(PROJECT_ROOT, "template"),
  views: path.join(PROJECT_ROOT, "views"),
  swagger: path.join(PROJECT_ROOT, "swagger", "openapi.yaml"),
  uploads: path.join(PROJECT_ROOT, "uploads"),
  firebaseKey: path.join(PROJECT_ROOT, "config", "push-notification-key.json"),
};
