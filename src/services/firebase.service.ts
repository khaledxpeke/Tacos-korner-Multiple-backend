import { initFirebase, admin } from "../config/firebase";

initFirebase();

export const sendPushNotification = async (
  token: string,
  payload: { notification: { title: string; body: string } }
): Promise<void> => {
  await admin.messaging().send({
    ...payload,
    token,
  });
};

export { admin };
