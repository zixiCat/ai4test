import "dotenv/config";
import OpenAI from "openai";

const openai = new OpenAI(
    {
        apiKey: process.env.DASHSCOPE_SG_API_KEY,
        baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    }
);

const startedAt = Date.now();
let ttft = undefined;
async function main() {
    const completion = await openai.chat.completions.create({
        model: "qwen3.5-flash",
        messages: [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "你是谁？"}
        ],
        stream: true,
        stream_options: {include_usage: true},
    });
    for await (const chunk of completion) {
        if(!ttft) {
            ttft = Date.now() - startedAt;
            console.log(ttft)
        }
    }
}

main();