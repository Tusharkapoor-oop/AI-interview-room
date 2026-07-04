/**
 * Google Gemini ↔ Claude Code Bridge Proxy
 * Converts Anthropic API format → OpenAI API format (Google Gemini compatible)
 * Run: node gemini-proxy.js
 */

const http = require('http');
const https = require('https');

const PROXY_PORT = 8080;
const GEMINI_API_KEY = 'AQ.Ab8RN6IxJfVa0CZ_y1Ajp1aXfLOrCTThkuo6IS0DeZBRxV5neQ';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_HOST = 'generativelanguage.googleapis.com';
const GEMINI_PATH = '/v1beta/openai/chat/completions';

function anthropicToOpenAI(body) {
  const messages = [];
  if (body.system) {
    messages.push({ role: 'system', content: body.system });
  }
  for (const msg of (body.messages || [])) {
    if (typeof msg.content === 'string') {
      messages.push({ role: msg.role, content: msg.content });
    } else if (Array.isArray(msg.content)) {
      const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
      messages.push({ role: msg.role, content: text });
    }
  }
  return {
    model: GEMINI_MODEL,
    messages,
    max_tokens: body.max_tokens || 4096,
    stream: body.stream || false,
    temperature: body.temperature ?? 0.7,
  };
}

function openAIToAnthropic(data) {
  const choice = data.choices?.[0];
  const content = choice?.message?.content || '';
  return {
    id: data.id || ('msg_' + Date.now()),
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: content }],
    model: 'claude-3-5-sonnet-20241022',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: data.usage?.prompt_tokens || 0,
      output_tokens: data.usage?.completion_tokens || 0,
    },
  };
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', backend: 'Google Gemini', model: GEMINI_MODEL }));
    return;
  }

  // Models list — Claude Code calls this to validate the model name
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      object: 'list',
      data: [
        { id: 'claude-3-5-sonnet-20241022', object: 'model', created: 1700000000, owned_by: 'google' },
        { id: 'claude-opus-4-5', object: 'model', created: 1700000000, owned_by: 'google' },
        { id: GEMINI_MODEL, object: 'model', created: 1700000000, owned_by: 'google' },
      ]
    }));
    return;
  }

  if (req.method === 'POST' && req.url === '/v1/messages') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); return;
      }

      const isStreaming = parsed.stream === true;
      const openAIBody = anthropicToOpenAI(parsed);
      openAIBody.stream = isStreaming;
      const openAIBodyStr = JSON.stringify(openAIBody);

      console.log(`[${new Date().toISOString()}] → ${isStreaming ? 'STREAM' : 'SYNC'} | model: ${GEMINI_MODEL}`);

      const options = {
        hostname: GEMINI_HOST,
        port: 443,
        path: GEMINI_PATH,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GEMINI_API_KEY}`,
          'Content-Length': Buffer.byteLength(openAIBodyStr),
        },
      };

      const proxyReq = https.request(options, (proxyRes) => {
        if (isStreaming) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
          const msgId = 'msg_' + Date.now();
          res.write(`event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { id: msgId, type: 'message', role: 'assistant', content: [], model: 'claude-3-5-sonnet-20241022', usage: { input_tokens: 0, output_tokens: 0 } } })}\n\n`);
          res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`);
          res.write(`event: ping\ndata: ${JSON.stringify({ type: 'ping' })}\n\n`);

          let buffer = '';
          proxyRes.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
                res.write(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 0 } })}\n\n`);
                res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
                res.end(); return;
              }
              try {
                const p = JSON.parse(data);
                const delta = p.choices?.[0]?.delta?.content;
                if (delta) res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: delta } })}\n\n`);
              } catch (_) {}
            }
          });
          proxyRes.on('end', () => { if (!res.writableEnded) res.end(); });
        } else {
          let data = '';
          proxyRes.on('data', chunk => data += chunk);
          proxyRes.on('end', () => {
            try {
              const openAIResp = JSON.parse(data);
              if (openAIResp.error) {
                console.error('Google Gemini error:', openAIResp.error);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: openAIResp.error.message || 'Google Gemini error' } }));
                return;
              }
              const anthropicResp = openAIToAnthropic(openAIResp);
              console.log(`[${new Date().toISOString()}] ← Response: "${anthropicResp.content[0]?.text?.slice(0, 80)}..."`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(anthropicResp));
            } catch (e) {
              console.error('Parse error:', e.message, 'Raw:', data.slice(0, 200));
              res.writeHead(500); res.end(JSON.stringify({ error: 'Parse error' }));
            }
          });
        }
      });

      proxyReq.on('error', (err) => {
        console.error('❌ Google Gemini connection failed:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'connection_error', message: `Cannot connect to Google Gemini API: ${err.message}` } }));
      });

      proxyReq.write(openAIBodyStr);
      proxyReq.end();
    });
    return;
  }

  res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PROXY_PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  Google Gemini ↔ Claude Code Bridge READY  ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║  Listening on  : http://localhost:${PROXY_PORT}      ║`);
  console.log(`║  Forwarding to : Google Gemini API         ║`);
  console.log(`║  Model         : ${GEMINI_MODEL}            ║`);
  console.log('╚════════════════════════════════════════════╝');
  console.log('');
  console.log('✅ Ready! Now open a new terminal and run: claude');
});
