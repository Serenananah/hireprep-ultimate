import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.API_KEY   // ❗ 只会在服务器端读取
    });

    const { messages } = req.body;

    const result = await ai.generate({
      model: "gemini-2.0-flash-exp",
      contents: messages,
    });

    res.status(200).json(result);
  } catch (err) {
    console.error("Gemini Error:", err);
    res.status(500).json({ error: err.message });
  }
}
