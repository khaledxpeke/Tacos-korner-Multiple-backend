const { encode } = require('blurhash');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

async function getBlurhashFromImage(imagePath) {
  try {
    const img = await loadImage(imagePath);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, img.width, img.height);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const blurhash = encode(imageData.data, img.width, img.height, 4, 4);
    return blurhash;
  } catch (err) {
    return null;
  }
}

module.exports = { getBlurhashFromImage };
