import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import hbs from "nodemailer-express-handlebars";
import path from "path";
import { Settings } from "../models/settings.model";
import { decrypt } from "../middleware/crypto";
import { env } from "./environment";
import { paths } from "./paths";

export type MailTransporter = Transporter | { sendMail: () => Promise<never> };

export const createTransporter = async (
  restaurantId?: string | null
): Promise<MailTransporter> => {
  let settings = null;
  if (restaurantId) {
    settings = await Settings.findOne({ restaurantId });
  }

  const host = settings?.host || env.emailHost;
  const port = settings?.port || env.emailPort;
  const user = settings?.emailUser || env.emailUser;
  const encryptedPass = settings?.emailPass || env.emailPassword;

  if (!host || !port || !user || !encryptedPass) {
    console.error(
      `Email settings are not fully configured for restaurant ${restaurantId}.`
    );
    return {
      sendMail: () =>
        Promise.reject(new Error("Email service is not configured for this restaurant.")),
    };
  }

  const pass = decrypt(encryptedPass);

  const transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: {
      user,
      pass,
    },
  });

  transporter.use(
    "compile",
    hbs({
      viewEngine: {
        extname: ".handlebars",
        layoutsDir: paths.template,
        defaultLayout: "index",
      },
      viewPath: paths.template.endsWith("template")
        ? path.join(paths.template, "..")
        : paths.template,
    })
  );

  return transporter;
};
