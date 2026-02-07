
require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const Tesseract = require("tesseract.js");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const pdfPoppler = require("pdf-poppler");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------
// UPLOAD
// ---------------------------
const upload = multer({ dest: "uploads/" });

// ---------------------------
// OCR API KEY
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
// GITHUB MODELS CLIENT
// ---------------------------
const aiClient = new OpenAI({
  apiKey: process.env.GITHUB_TOKEN,
  baseURL: "https://models.inference.ai.azure.com"
});

// ---------------------------
app.get("/", (req, res) => {
  res.send("GYNEX AI Backend Running (FORCE OCR MODE)");
});

// ====================================
// OCR ENDPOINT (FORCE OCR)
// ====================================
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

      // ---------- TXT ----------
      if (fileName.endsWith(".txt")) {
        const text = fs.readFileSync(filePath, "utf8");
        return res.json({ text });
      }

      // ---------- PDF ----------
      if (fileName.endsWith(".pdf")) {

        console.log("FORCE OCR PDF → converting to images");

        const outDir = "uploads/pdf_images";

        fs.rmSync(outDir, { recursive: true, force: true });
        fs.mkdirSync(outDir, { recursive: true });

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

          console.log("OCR page:", img);

          const imgPath = path.join(outDir, img);
          const cleaned = imgPath + "_clean.png";

          await sharp(imgPath)
            .grayscale()
            .resize({ width: 1700 })
            .normalize()
            .toFile(cleaned);

          const result = await Tesseract.recognize(
            cleaned,
            "eng",
            {
              tessedit_pageseg_mode: 3,
              preserve_interword_spaces: 1
            }
          );

          finalText += result.data.text + "\n";
        }

        return res.json({ text: finalText });
      }

      // ---------- IMAGE ----------
      const cleaned = filePath + "_clean.png";

      await sharp(filePath)
        .grayscale()
        .resize({ width: 1700 })
        .normalize()
        .toFile(cleaned);

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

// ====================================
// AI ANALYSIS
// ====================================
app.post("/analyze", async (req, res) => {

  try {

    const { text, question } = req.body;

    const prompt = `
You are an intelligent document assistant.

DOCUMENT:
${text}

QUESTION:
${question || "Give a short clean summary"}
`;

    const response = await aiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3
    });

    res.json({
      answer: response.choices[0].message.content
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI analysis failed" });
  }

});

// ---------------------------
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("GYNEX AI backend running on port", PORT);
});
