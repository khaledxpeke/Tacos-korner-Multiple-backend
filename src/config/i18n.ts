import path from "path";
import i18next from "i18next";
import i18nextMiddleware from "i18next-http-middleware";
import FsBackend from "i18next-fs-backend";
import { paths } from "./paths";

export const initI18n = (): void => {
  void i18next
    .use(FsBackend as never)
    .use(i18nextMiddleware.LanguageDetector as never)
    .init({
      fallbackLng: "fr",
      preload: ["en", "fr", "ar"],
      ns: ["translation"],
      defaultNS: "translation",
      backend: { loadPath: path.join(paths.translations, "{{lng}}.json") },
      detection: {
        order: ["querystring", "cookie"],
        lookupQuerystring: "lng",
      },
      initImmediate: false,
      keySeparator: false,
    });
};

export const i18nMiddleware = () => i18nextMiddleware.handle(i18next);

export { i18next };
