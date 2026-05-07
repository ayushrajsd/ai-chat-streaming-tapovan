# OpenAI Streaming Chat Demo

A minimal React + Vite application that demonstrates streaming chat responses from the OpenAI API through an Express backend. The browser never receives your OpenAI API key; it only talks to the local Express server.

## What this demonstrates

- A clean chat UI with a scrolling conversation history and a message composer pinned to the bottom.
- Role-labeled messages for the user and assistant.
- A subtle thinking indicator while the server starts the OpenAI stream.
- Assistant responses that appear incrementally as Server-Sent Events arrive.
- A `POST /api/chat` Express endpoint that calls `openai.chat.completions.create` with `stream: true`.

## Prerequisites

- Node.js 18 or newer.
- npm.
- An OpenAI API key.

## Setup

1. Clone the repository and enter it:

   ```bash
   git clone <repo-url>
   cd ai-chat-streaming-tapovan
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a server-side environment file:

   ```bash
   cp .env.example .env
   ```

4. Add your OpenAI API key to `.env`:

   ```bash
   OPENAI_API_KEY=your-real-key-here
   ```

5. Run the Express server:

   ```bash
   npm run server
   ```

6. In a second terminal, run the Vite client:

   ```bash
   npm run client
   ```

7. Open the Vite URL shown in your terminal, usually `http://localhost:5173`.

## How SSE streaming works here

1. The React app sends the conversation history to `POST /api/chat`.
2. The Express server validates the message array and starts an OpenAI Chat Completions request using model `gpt-4o-mini`, `max_tokens: 1024`, and `stream: true`.
3. OpenAI returns an async iterable of streaming chunks to the server.
4. For every chunk that contains `delta.content`, Express writes an SSE event back to the browser:

   ```text
   event: delta
   data: {"content":"..."}
   ```

5. The React app reads the response body with a stream reader, parses each SSE event, and appends incoming `content` to the active assistant message in state.
6. When the OpenAI stream ends, the server sends a final `done` event and closes the response.

## Notes

- The OpenAI API key belongs only in `.env`, which is ignored by Git.
- The client can optionally target a different backend URL with `VITE_API_BASE_URL`, but do not put secret keys in Vite environment variables.
- There is no auth, database, or deployment configuration in this demo.
