// scripts/fixes/comprehensiveMediaFix.js
const mongoose = require("mongoose");
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

async function comprehensiveMediaFix() {
  await mongoose.connect(process.env.DATABASE_URL);
  console.log("🟢 Connected to MongoDB.\n");
  
  const Media = require("../../models/media");
  
  // Mapping for permutations
  const folderToTypeMap = {
    'logos': 'logo',
    'logo': 'logo',
    'banners': 'banner', 
    'banner': 'banner',
    'categories': 'category',
    'category': 'category',
    'ingrediants': 'ingredient',
    'ingredient': 'ingredient',
    'product': 'product',
    'products': 'product',
    'carousel': 'carousel',
    'allergies': 'allergy',
    'allergy': 'allergy',
    'global/allergies': 'allergy',
    'global/image': 'carousel' // Assuming these are carousel images
  };
  
  const targetTypeToTypeMap = {
    'restaurant': 'logo',
    'settings': 'banner',
    'category': 'category',
    'ingredient': 'ingredient',
    'product': 'product',
    'carousel': 'carousel',
    'allergy': 'allergy'
  };
  
  let fixed = 0;
  let skipped = 0;
  
  // Find all problematic docs
  const problematicDocs = await Media.find({
    $or: [
      { type: null },
      { type: "image" },
      { type: "undefined" }
    ]
  });
  
  console.log(`Found ${problematicDocs.length} problematic documents\n`);
  
  for (const doc of problematicDocs) {
    let correctType = null;
    
    // Method 1: Extract from URL folder structure
    if (doc.url) {
      // Strip domain if present
      const cleanUrl = doc.url.replace(/^https?:\/\/[^\/]+/, '');
      
      // Look for folder patterns
      for (const [folder, type] of Object.entries(folderToTypeMap)) {
        if (cleanUrl.includes(`/${folder}/`)) {
          correctType = type;
          break;
        }
      }
    }
    
    // Method 2: Fallback to targetType
    if (!correctType && doc.targetType) {
      correctType = targetTypeToTypeMap[doc.targetType];
    }
    
    if (correctType) {
      console.log(`✅ Fixing ${doc._id}:`);
      console.log(`   old type: ${doc.type} → new type: ${correctType}`);
      console.log(`   URL: ${doc.url}`);
      console.log(`   TargetType: ${doc.targetType}`);
      
      await Media.findByIdAndUpdate(doc._id, { type: correctType });
      fixed++;
    } else {
      console.warn(`⚠️ Can't fix ${doc._id}: no type mapping found`);
      console.warn(`   targetType: ${doc.targetType}`);
      console.warn(`   URL: ${doc.url}`);
      skipped++;
    }
  }
  
  console.log(`\n🎉 Fixed ${fixed} documents`);
  console.log(`⚠️ Skipped ${skipped} documents (no mapping found)`);
  await mongoose.disconnect();
}

comprehensiveMediaFix().then(() => {
  console.log("Done!");
  process.exit(0);
}).catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});