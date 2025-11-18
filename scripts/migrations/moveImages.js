// scripts/migrations/moveToHybridFolders.js
const fs = require("fs").promises;
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const OLD_PATH_BASE = path.join(__dirname, "..", "..", "..", "mediaBackend", "uploads");
const NEW_SHARED_PATH = path.join(OLD_PATH_BASE, "media", "shared");

// ✅ Define scopes
const SHARED_TYPES = ["product", "category", "ingredient", "allergy"];
const RESTAURANT_TYPES = ["carousel", "logo", "banner"];

/**
 * Resolves a file URL to a relative path from the uploads directory
 * Handles: 
 * - Full URLs: http://localhost:4000/uploads/restaurant/.../file.jpg
 * - Absolute paths: /uploads/restaurant/.../file.jpg
 * - Relative paths: uploads/restaurant/.../file.jpg or restaurant/.../file.jpg
 * @param {string} fileUrl - The URL/path from the database
 * @returns {string} Relative path from uploads directory
 */
function resolveFilePath(fileUrl) {
  if (!fileUrl) return '';
  
  let normalizedPath = fileUrl.replace(/\\/g, '/'); // Normalize slashes
  
  // Handle full URLs
  if (normalizedPath.startsWith('http')) {
    try {
      const url = new URL(normalizedPath);
      // Remove leading /uploads from pathname
      return url.pathname.replace(/^\/uploads\/?/, '');
    } catch (e) {
      // If URL parsing fails, fall back to string manipulation
      const urlAfterUploads = normalizedPath.replace(/^https?:\/\/[^\/]+\/uploads\/?/, '');
      return urlAfterUploads;
    }
  }
  
  // Handle absolute paths starting with /uploads
  if (normalizedPath.startsWith('/uploads/')) {
    return normalizedPath.replace(/^\/uploads\/?/, '');
  }
  
  // Handle relative paths starting with uploads/
  if (normalizedPath.startsWith('uploads/')) {
    return normalizedPath.replace(/^uploads\/?/, '');
  }
  
  // Return as-is if already relative
  return normalizedPath;
}

async function moveToHybridFolders() {
  await mongoose.connect(process.env.DATABASE_URL);
  console.log("🟢 Connected to MongoDB.\n");
  
  const Media = require("../../models/media");
  
  let totalMoved = { shared: 0, restaurant: 0 };
  
  // Process shared types
  console.log("=== MOVING SHARED FILES ===\n");
  for (const type of SHARED_TYPES) {
    console.log(`--- Processing ${type} files ---`);
    
    // Find Media docs with per-restaurant URLs (not already shared)
    const pattern = new RegExp(`restaurant_[0-9a-f]{24}[/\\\\]${type}s?[/\\\\]`, 'i');
    const mediaDocs = await Media.find({ 
      type,
      url: { $regex: pattern }  // Will match "categories/" or "category/"
    });
    
    console.log(`Found ${mediaDocs.length} ${type} files to move\n`);
    
    for (const doc of mediaDocs) {
      const oldUrl = doc.url;
      const fileName = path.basename(oldUrl);
      const newUrl = path.posix.join("uploads", "media", "shared", type, fileName);
      
      // Resolve the correct relative path from the URL
      const relativeOldPath = resolveFilePath(oldUrl);
      const oldFullPath = path.join(OLD_PATH_BASE, relativeOldPath);
      const newFullPath = path.join(NEW_SHARED_PATH, type, fileName);
      
      try {
        // Check if file exists
        await fs.stat(oldFullPath);
        
        // Create shared folder
        await fs.mkdir(path.join(NEW_SHARED_PATH, type), { recursive: true });
        
        // Move file
        await fs.rename(oldFullPath, newFullPath);
        console.log(`📁 ${type}: ${fileName}`);
        
        // Update Media doc: URL + scope
        await Media.findByIdAndUpdate(doc._id, { 
          url: newUrl, 
          scope: 'shared' 
        });
        
        totalMoved.shared++;
        
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.warn(`⚠️ File not found (maybe already moved): ${oldFullPath}`);
          // Still update URL if file is gone (assume moved manually)
          await Media.findByIdAndUpdate(doc._id, { 
            url: newUrl, 
            scope: 'shared' 
          });
          totalMoved.shared++;
        } else {
          console.error(`❌ Error moving ${fileName}: ${error.message}`);
        }
      }
    }
    console.log(""); // Empty line between types
  }
  
  // Process restaurant-scoped types
  console.log("=== VERIFYING RESTAURANT FILES ===\n");
  for (const type of RESTAURANT_TYPES) {
    console.log(`--- Checking ${type} files ---`);
    
    // Find Media docs for this type
    const mediaDocs = await Media.find({ type });
    console.log(`Found ${mediaDocs.length} ${type} documents\n`);
    
    for (const doc of mediaDocs) {
      if (!doc.url) {
        console.warn(`⚠️ No URL for ${type} document: ${doc._id}`);
        continue;
      }
      
      // Resolve the correct relative path from the URL
      const relativePath = resolveFilePath(doc.url);
      const fullPath = path.join(OLD_PATH_BASE, relativePath);
      
      try {
        await fs.stat(fullPath);
        await Media.findByIdAndUpdate(doc._id, { scope: 'restaurant' });
        totalMoved.restaurant++;
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.warn(`⚠️ Missing file: ${fullPath}`);
        } else {
          console.error(`❌ Error checking ${type} ${doc._id}: ${error.message}`);
        }
      }
    }
    console.log(""); // Empty line between types
  }
  
  console.log("=== CLEANUP ===\n");
  
  // Clean up empty restaurant folders
  const restaurantFolders = await fs.readdir(OLD_PATH_BASE, { withFileTypes: true });
  let foldersDeleted = 0;
  
  for (const folder of restaurantFolders) {
    if (folder.isDirectory() && folder.name.startsWith("restaurant_")) {
      const folderPath = path.join(OLD_PATH_BASE, folder.name);
      const contents = await fs.readdir(folderPath);
      
      let hasFiles = false;
      
      // Check each subfolder
      for (const subfolder of contents) {
        const subPath = path.join(folderPath, subfolder);
        const stat = await fs.stat(subPath);
        
        if (stat.isDirectory()) {
          const subContents = await fs.readdir(subPath);
          if (subContents.length === 0) {
            // Delete empty subfolder
            await fs.rmdir(subPath);
            console.log(`🗑️ Deleted empty subfolder: ${folder.name}/${subfolder}`);
          } else {
            hasFiles = true;
          }
        } else {
          hasFiles = true;
        }
      }
      
      // Delete restaurant folder if now empty
      if (!hasFiles) {
        await fs.rmdir(folderPath);
        foldersDeleted++;
        console.log(`🗑️ Deleted empty folder: ${folder.name}`);
      }
    }
  }
  
  console.log(`\n🏁 SUMMARY`);
  console.log(`✅ Shared files moved: ${totalMoved.shared}`);
  console.log(`✅ Restaurant files verified: ${totalMoved.restaurant}`);
  console.log(`✅ Empty folders deleted: ${foldersDeleted}`);
  
  await mongoose.disconnect();
  console.log("\n🟡 Disconnected from MongoDB.");
}

moveToHybridFolders().catch(console.error);