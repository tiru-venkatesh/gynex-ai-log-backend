const fs = require("fs");
const pdfParse = require("pdf-parse");
const { Poppler } = require("node-poppler");
const sharp = require("sharp");
const Tesseract = require("tesseract.js");

const poppler = new Poppler();

async function extractTextFromPDF(pdfPath) {

  // ---- STEP 1: Try digital text ----
  const dataBuffer = fs.readFileSync(pdfPath);
  const parsed = await pdfParse(dataBuffer);

  if (parsed.text && parsed.text.trim().length > 500) {
    return parsed.text;
  }

  // ---- STEP 2: Convert to images ----
  const outDir = "uploads/pdf_pages";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  await poppler.pdfToCairo(pdfPath, `${outDir}/page`, {
    pngFile: true,
    resolution: 300
  });

  const pages = fs.readdirSync(outDir).sort();
  let fullText = "";

  for (const p of pages) {

    const img = `${outDir}/${p}`;
    const clean = img + "_clean.png";

    await sharp(img)
      .grayscale()
      .resize({ width: 2600 })
      .normalize()
      .sharpen()
      .rotate()
      .toFile(clean);

    const result = await Tesseract.recognize(
      clean,
      "eng+hin+tam+tel"
    );

    fullText += result.data.text + "\n";
  }

  fs.rmSync(outDir, { recursive: true, force: true });

  return fullText;
}

module.exports = extractTextFromPDF;
