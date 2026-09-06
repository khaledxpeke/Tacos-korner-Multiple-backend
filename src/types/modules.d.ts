declare module "mongoose-sequence" {
  import type { Mongoose, Schema } from "mongoose";

  interface AutoIncrementOptions {
    inc_field: string;
    id?: string;
    start_seq?: number;
  }

  type AutoIncrementPlugin = (schema: Schema, options?: AutoIncrementOptions) => void;

  function AutoIncrementFactory(mongoose: Mongoose): AutoIncrementPlugin;
  export = AutoIncrementFactory;
}

declare module "pdf-creator-node" {
  interface PdfDocument {
    html: string;
    data: unknown;
    path: string;
    type?: string;
  }

  interface PdfOptions {
    format?: string;
    orientation?: string;
    border?: string;
    timeout?: number;
  }

  function create(document: PdfDocument, options?: PdfOptions): Promise<unknown>;
  export = { create };
}

declare module "nodemailer-express-handlebars" {
  import type { PluginFunction } from "nodemailer/lib/mailer";

  interface HandlebarsOptions {
    viewEngine: {
      extname?: string;
      layoutsDir?: string;
      defaultLayout?: string | boolean;
      partialsDir?: string;
    };
    viewPath: string;
    extName?: string;
  }

  function hbs(options: HandlebarsOptions): PluginFunction;
  export = hbs;
}

declare module "i18next-http-middleware" {
  import type { RequestHandler } from "express";
  import type { i18n } from "i18next";

  export const LanguageDetector: unknown;
  export function handle(instance: i18n): RequestHandler;
}

declare module "i18next-fs-backend" {
  const FsBackend: unknown;
  export default FsBackend;
}
