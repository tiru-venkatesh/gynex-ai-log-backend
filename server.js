// =====================================
// GYNEX AI - IMAGE OCR BACKEND (LINUX SAFE)
// =====================================

require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const Tesseract = require("tesseract.js");
const fs = require("fs");
const sharp = require("sharp");

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------
// UPLOAD CONFIG
// ---------------------------
const upload = multer({ dest: "uploads/" });

// ---------------------------
// SIMPLE API KEY
// ---------------------------
const API_KEY = "GYNEX_OCR_123";

function checkKey(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: "Invalid API Key" });
  }
  next();
}

// ---------------------------
// HEALTH CHECK
// ---------------------------
app.get("/", (req, res) => {
  res.send("GYNEX AI OCR Backend Running");
});

// =================================================
// IMAGE OCR ONLY (NO PDF)
// =================================================
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
      const fileName = req.file.originalname.toLowerCase();

      // TXT FILE
      if (fileName.endsWith(".txt")) {
        const text = fs.readFileSync(filePath, "utf8");
        return res.json({ text });
      }

      // BLOCK PDF
      if (fileName.endsWith(".pdf")) {
        return res.json({
          error: "PDF OCR disabled on server. Upload image instead."
        });
      }

      // PREPROCESS IMAGE
      const cleaned = filePath + "_clean.png";

      await sharp(filePath)
        .resize({ width: 2000 })
        .grayscale()
        .sharpen()
        .normalize()
        .toFile(cleaned);

      // OCR
      const result = await Tesseract.recognize(
        cleaned,
        "eng",
        {
          tessedit_pageseg_mode: 3,
          preserve_interword_spaces: 1
        }
      );

      return res.json({ text: result.data.text });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "OCR failed" });
    }
  }
);

// ---------------------------
// START SERVER
// ---------------------------
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("GYNEX AI backend running on port", PORT);
});
