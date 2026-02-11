const OpenAI = require("openai");
const chunkText = require("../utils/chunker");

const client = new OpenAI({
  apiKey: process.env.GITHUB_TOKEN,
  baseURL: "https://models.inference.ai.azure.com"
});

async function analyzeLargeText(text, question) {

  const chunks = chunkText(text);

  let knowledge = "";

  for (const c of chunks) {
    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [{
        role: "user",
        content: `Extract key facts:\n${c}`
      }]
    });

    knowledge += r.choices[0].message.content + "\n";
  }

  const final = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: `
Using this information answer:

${knowledge}

Question: ${question || "Give structured summary"}
`
    }]
  });

  return final.choices[0].message.content;
}

module.exports = analyzeLargeText;
