import mongoose from "mongoose";

const COUNTER_FILTER = { id: "userId", reference_value: null };

export const isUserIdDuplicateError = (error: unknown) => {
  const err = error as { code?: number; message?: string };
  return err?.code === 11000 && String(err.message || "").includes("userId");
};

export const syncUserIdSequence = async () => {
  const db = mongoose.connection.db;
  if (!db) return;

  const [maxUser] = await db
    .collection("users")
    .find({ userId: { $type: "number" } })
    .sort({ userId: -1 })
    .project({ userId: 1 })
    .limit(1)
    .toArray();

  const maxId = typeof maxUser?.userId === "number" ? maxUser.userId : 0;
  await db.collection("counters").updateOne(
    COUNTER_FILTER,
    { $max: { seq: maxId } },
    { upsert: true }
  );
};
