// services/embedder.js

const { pipeline } = require("@xenova/transformers");

let embedder = null;

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
  }
  return embedder;
}

async function embedText(text) {

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Invalid text passed to embedder.");
  }

  const model = await getEmbedder();

  const output = await model(text, {
    pooling: "mean",
    normalize: true
  });

  return Array.from(output.data);
}

module.exports = embedText;
