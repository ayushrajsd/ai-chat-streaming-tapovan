import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';

const app = express();
const port = process.env.PORT || 3000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_ORIGIN || 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

function isValidMessage(message) {
  return (
    message &&
    ['system', 'user', 'assistant'].includes(message.role) &&
    typeof message.content === 'string'
  );
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
  }

  if (!Array.isArray(messages) || messages.length === 0 || !messages.every(isValidMessage)) {
    return res.status(400).json({ error: 'Request body must include a non-empty messages array.' });
  }

  const abortController = new AbortController();
  req.on('aborted', () => abortController.abort());

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  try {
    const stream = await openai.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 1024,
        stream: true
      },
      { signal: abortController.signal }
    );

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;

      if (content) {
        sendSse(res, 'delta', { content });
      }
    }

    sendSse(res, 'done', {});
    res.end();
  } catch (error) {
    if (!res.writableEnded) {
      sendSse(res, 'error', { message: error.message || 'Streaming failed.' });
      res.end();
    }
  }
});

app.listen(port, () => {
  console.log(`OpenAI streaming server listening at http://localhost:${port}`);
});
