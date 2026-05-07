import React, { useEffect, useRef, useState } from 'react';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const starterMessages = [
  {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: 'Hi! Ask me anything and watch the answer stream in.'
  }
];

function toApiMessages(messages) {
  return messages
    .filter((message) => ['user', 'assistant'].includes(message.role) && message.content.trim())
    .map(({ role, content }) => ({ role, content }));
}

function parseSseEvent(rawEvent) {
  const lines = rawEvent.split('\n');
  const event = lines.find((line) => line.startsWith('event:'))?.replace('event:', '').trim();
  const data = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.replace('data:', '').trim())
    .join('\n');

  return { event, data: data ? JSON.parse(data) : {} };
}

export default function App() {
  const [messages, setMessages] = useState(starterMessages);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState('');
  const endOfMessagesRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  async function sendMessage(event) {
    event.preventDefault();

    const trimmedInput = input.trim();
    if (!trimmedInput || isStreaming) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmedInput
    };
    const assistantMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: ''
    };
    const nextMessages = [...messages, userMessage, assistantMessage];

    setMessages(nextMessages);
    setInput('');
    setError('');
    setIsStreaming(true);
    setIsThinking(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`${apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: toApiMessages([...messages, userMessage]) }),
        signal: abortController.signal
      });

      if (!response.ok || !response.body) {
        const details = await response.text();
        throw new Error(details || 'The server could not start the stream.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedFirstDelta = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const rawEvent of events) {
          if (!rawEvent.trim()) continue;
          const parsedEvent = parseSseEvent(rawEvent);

          if (parsedEvent.event === 'delta') {
            if (!receivedFirstDelta) {
              receivedFirstDelta = true;
              setIsThinking(false);
            }

            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === assistantMessage.id
                  ? { ...message, content: message.content + parsedEvent.data.content }
                  : message
              )
            );
          }

          if (parsedEvent.event === 'error') {
            throw new Error(parsedEvent.data.message || 'The stream returned an error.');
          }
        }
      }
    } catch (streamError) {
      if (streamError.name !== 'AbortError') {
        setError(streamError.message || 'Something went wrong while streaming.');
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessage.id && !message.content
              ? { ...message, content: 'Sorry, I could not complete that response.' }
              : message
          )
        );
      }
    } finally {
      setIsStreaming(false);
      setIsThinking(false);
      abortControllerRef.current = null;
    }
  }

  function clearConversation() {
    abortControllerRef.current?.abort();
    setMessages([]);
    setError('');
    setIsStreaming(false);
    setIsThinking(false);
  }

  return (
    <main className="app-shell">
      <section className="chat-card" aria-label="Streaming chat demo">
        <header className="chat-header">
          <div>
            <p className="eyebrow">OpenAI SSE Demo</p>
            <h1>Streaming Chat</h1>
          </div>
          <button className="secondary-button" type="button" onClick={clearConversation}>
            Clear conversation
          </button>
        </header>

        <div className="messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty-state">Start a new conversation below.</div>
          ) : (
            messages.map((message) => {
              if (message.role === 'assistant' && !message.content && isThinking) {
                return null;
              }

              return (
                <article className={`message ${message.role}`} key={message.id}>
                  <div className="message-label">{message.role === 'user' ? 'You' : 'Assistant'}</div>
                  <p>{message.content}</p>
                </article>
              );
            })
          )}

          {isThinking && (
            <article className="message assistant thinking-message">
              <div className="message-label">Assistant</div>
              <div className="thinking" aria-label="Assistant is thinking">
                <span />
                <span />
                <span />
              </div>
            </article>
          )}

          <div ref={endOfMessagesRef} />
        </div>

        {error && <div className="error-message">{error}</div>}

        <form className="composer" onSubmit={sendMessage}>
          <label className="sr-only" htmlFor="message-input">
            Message
          </label>
          <textarea
            id="message-input"
            value={input}
            placeholder="Type your message..."
            rows="2"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage(event);
              }
            }}
          />
          <button type="submit" disabled={isStreaming || !input.trim()}>
            {isStreaming ? 'Streaming…' : 'Send'}
          </button>
        </form>
      </section>
    </main>
  );
}
