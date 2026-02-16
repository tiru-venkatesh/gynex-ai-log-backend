const faiss = require("faiss-node");
const embedText = require("./embedder");

let index = null;
let documents = [];

async function initStore() {
  if (!index) {
    index = new faiss.IndexFlatL2(384);
  }
}

async function addDocuments(chunks) {
  await initStore();

  for (const text of chunks) {

    if (!text || typeof text !== "string") continue;

    const clean = text.trim();
    if (clean.length < 50) continue;

    try {
      const vector = await embedText(clean);
      index.add([vector]);
      documents.push(clean);
    } catch (e) {
      console.warn("Skipped bad chunk");
    }
  }
}

async function isReady() {
  return index && index.ntotal > 0;
}

async function search(query, k = 5) {

  if (!await isReady()) return [];

  const qVec = await embedText(query);

  const safeK = Math.min(k, index.ntotal);

  const result = index.search([qVec], safeK);

  return result.labels[0]
    .map(i => documents[i])
    .filter(Boolean);
}

module.exports = { addDocuments, search, isReady };
