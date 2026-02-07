// =====================================
// GYNEX AI - OCR + CHAT BACKEND (STABLE)
// =====================================

process.env.PDF_POPPLER_SILENT = "true";
require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const Tesseract = require("tesseract.js");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const pdfPoppler = require("pdf-poppler");

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------
// FILE UPLOAD
// ---------------------------------
const upload = multer({ dest: "uploads/" });

// ---------------------------------
// API KEY
// ---------------------------------
const API_KEY = "GYNEX_OCR_123";

// ---------------------------------
// API KEY MIDDLEWARE
// ---------------------------------
function checkKey(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: "Invalid API Key" });
  }
  next();
}

// ---------------------------------
// HEALTH
// ---------------------------------
app.get("/", (req, res) => {
  res.send("GYNEX AI Backend Running");
});

// ---------------------------------
// ANALYZE TEST (GET)
// ---------------------------------
app.get("/analyze", (req, res) => {
  res.send("Analyze endpoint is alive (POST only)");
});

// ---------------------------------
// OCR ENDPOINT
// ---------------------------------
app.post(
  "/extract-text",
  checkKey,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const filePath = req.file.path;
      const name = req.file.originalname.toLowerCase();

      // ---------- TXT ----------
      if (name.endsWith(".txt")) {
        const text = fs.readFileSync(filePath, "utf8");
        return res.json({ text });
      }

      // ---------- PDF ----------
      if (name.endsWith(".pdf")) {
        const outDir = "uploads/pdf_images";

        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }

        // Force 300 DPI (no warnings)
        await pdfPoppler.convert(filePath, {
          format: "png",
          out_dir: outDir,
          out_prefix: "page",
          page: null,
          dpi: 300
        });

        const pages = fs.readdirSync(outDir);
        let finalText = "";

        for (const img of pages) {
          const imgPath = path.join(outDir, img);
          const clean = imgPath + "_clean.png";

          await sharp(imgPath)
            .grayscale()
            .resize({ width: 2200 })
            .sharpen()
            .normalize()
            .toFile(clean);

          const result = await Tesseract.recognize(
            clean,
            "eng"
          );

          finalText += result.data.text + "\n";
        }

        return res.json({ text: finalText });
      }

      // ---------- IMAGE ----------
      const clean = filePath + "_clean.png";

      await sharp(filePath)
        .grayscale()
        .resize({ width: 2200 })
        .sharpen()
        .normalize()
        .toFile(clean);

      const result = await Tesseract.recognize(
        clean,
        "eng"
      );

      return res.json({ text: result.data.text });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "OCR failed" });
    }
  }
);

// ---------------------------------
// CHAT / ANALYZE (POST)
// ---------------------------------
app.post("/analyze", async (req, res) => {
  try {
    const { text, question } = req.body;

    // TEMP RESPONSE (Stable)
    res.json({
      answer: "AI Chat coming soon. OCR is working successfully."
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI failed" });
  }
});

// ---------------------------------
// START SERVER
// ---------------------------------
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("GYNEX AI backend running on port", PORT);
});
