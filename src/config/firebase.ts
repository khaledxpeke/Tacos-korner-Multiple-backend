import admin from "firebase-admin";
import { paths } from "./paths";
import { logger } from "../utils/logger";

export const initFirebase = (): typeof admin => {
  if (admin.apps.length > 0) {
    return admin;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const serviceAccount = require(paths.firebaseKey) as admin.ServiceAccount;
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  logger.info("Firebase Admin initialized");
  return admin;
};

export { admin };
