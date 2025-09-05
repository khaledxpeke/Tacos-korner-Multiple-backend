// Migration: Populate Type.ingredients from Ingrediant.types
// Usage:
//   DRY RUN (no writes): node scripts/migrations/migrate_type_ingredients.js
//   APPLY changes:       APPLY=1 node scripts/migrations/migrate_type_ingredients.js
//   Remove old backrefs (unset ingrediant.types) additionally:
//                        APPLY=1 REMOVE_OLD=1 node scripts/migrations/migrate_type_ingredients.js
//
// Env:
//   DATABASE_URL must be set (same as app).
//
// Idempotent: safe to re-run; avoids duplicate ObjectIds.

require('dotenv').config();
const mongoose = require('mongoose');

const Type = require('../../models/type');
const Ingrediant = require('../../models/ingrediant');

const APPLY = process.env.APPLY === '1' || process.env.APPLY === 'true' || process.argv.includes('--apply');
const REMOVE_OLD = process.env.REMOVE_OLD === '1' || process.env.REMOVE_OLD === 'true' || process.argv.includes('--remove-old');

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL not set.');
    process.exit(1);
  }

  await mongoose.connect(process.env.DATABASE_URL, {
    autoIndex: false
  });

  console.log('Connected to MongoDB');
  console.log('Mode:', APPLY ? 'APPLY (writes enabled)' : 'DRY RUN (no writes)');
  if (REMOVE_OLD) console.log('Old ingrediant.types will be removed (unset)');

  // Load all ingredients that reference at least one type
  const query = { types: { $exists: true, $ne: [] } };
  const ingrediants = await Ingrediant.find(query)
    .select('_id types restaurantId')
    .lean();

  console.log(`Found ${ingrediants.length} ingrediants with legacy types references.`);

  // Map typeId => Set of ingredientIds
  const map = new Map();
  for (const ing of ingrediants) {
    (ing.types || []).forEach(tid => {
      const key = tid.toString();
      if (!map.has(key)) map.set(key, { ingredients: new Set(), restaurantIds: new Set() });
      map.get(key).ingredients.add(ing._id.toString());
      if (ing.restaurantId) map.get(key).restaurantIds.add(ing.restaurantId.toString());
    });
  }

  console.log(`Aggregated ${map.size} unique Type ids from ingrediants.`);

  let typesFound = 0;
  let typesMissing = 0;
  let updatedTypes = 0;
  let forcedMode = 0;
  const ops = [];

  for (const [typeId, data] of map.entries()) {
    const type = await Type.findById(typeId);
    if (!type) {
      typesMissing++;
      console.warn('WARN: Type not found (skipping)', typeId);
      continue;
    }
    typesFound++;

    // Only ingest into INGREDIENT mode types.
    if (type.mode === 'PRODUCT') {
      // Optionally skip; could force switch mode, but that is dangerous.
      console.warn(`SKIP: Type ${typeId} is PRODUCT mode; not attaching ingredients.`);
      continue;
    }

    const beforeCount = type.ingredients ? type.ingredients.length : 0;

    // Ensure array exists
    if (!Array.isArray(type.ingredients)) type.ingredients = [];

    const existingSet = new Set(type.ingredients.map(id => id.toString()));
    let added = 0;
    for (const ingId of data.ingredients) {
      if (!existingSet.has(ingId)) {
        type.ingredients.push(new mongoose.Types.ObjectId(ingId));
        existingSet.add(ingId);
        added++;
      }
    }

    if (added > 0) {
      updatedTypes++;
      const restaurantInfo = `(Restaurants: ${[...data.restaurantIds].join(', ')})`;
  console.log(`Type ${typeId} ${restaurantInfo}: +${added} ingredients (total ${beforeCount} -> ${type.ingredients.length})`);
      if (APPLY) {
        ops.push(type.save());
      }
    }
  }

  if (APPLY && ops.length) {
    await Promise.all(ops);
  }

  if (REMOVE_OLD) {
    if (!APPLY) {
      console.log('REMOVE_OLD requested but skipped (dry run).');
    } else {
      const removeQuery = { types: { $exists: true, $ne: [] } };
      const res = await Ingrediant.updateMany(
        removeQuery,
        { $unset: { types: "" } }
      );
      console.log(`Unset legacy types field on ${res.modifiedCount} ingrediants.`);
    }
  }

  console.log('Summary:');
  console.log(' Types referenced (found):', typesFound);
  console.log(' Types missing:', typesMissing);
  console.log(' Types updated with new ingredients:', updatedTypes);
  console.log(' Writes applied:', APPLY);
  console.log(' Legacy ingrediant.types removed:', APPLY && REMOVE_OLD);

  await mongoose.disconnect();
  console.log('Done.');
  process.exit(0);
}

run().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
