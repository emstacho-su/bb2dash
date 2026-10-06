// bb2dash :: workspace/test/scrub-recording.mjs
//
//   node test/scrub-recording.mjs <raw stdout of a recording> <fixture to write> [--mask-answer]
//
// Turns the raw stdout of one `claude -p --output-format stream-json` recording into a fixture that
// can be committed (brief 102, task 9). The raw file never enters git. What it rewrites:
//
//   * every tool-result body (`user` lines: each `tool_result` block's `content`, and the line's own
//     `tool_use_result` copy) becomes the literal `<scrubbed>`, so no course material enters git;
//   * the init line's `cwd` and the host inventory and host paths it lists (`slash_commands`,
//     `terminal_slash_commands`, `skills`, `plugins`, `agents`, `memory_paths`,
//     `messaging_socket_path`, `powershell_path`) become `<scrubbed>`;
//   * every thinking signature becomes `<scrubbed>` and any thinking text is masked;
//   * with --mask-answer, the answer text is masked letter by letter (a letter becomes `x`, a digit
//     `9`; spaces, line breaks and punctuation stay), in the text deltas, in the assistant messages
//     and in the result line alike. An answer to a lookup quotes the document it read, so its words
//     are course material too; the mask keeps every delta's length and position, and the deltas
//     still join to the final text.
//
// It then refuses to write a fixture that still holds a host path, a key, a token or a DSN shape.

import fs from 'node:fs';

const SCRUBBED = '<scrubbed>';
const INIT_HOST_KEYS = [
  'cwd',
  'slash_commands',
  'terminal_slash_commands',
  'skills',
  'plugins',
  'agents',
  'memory_paths',
  'messaging_socket_path',
  'powershell_path',
];
const FORBIDDEN = [
  ['a Windows drive path', /\b[A-Za-z]:[\\/]/],
  ['a home folder path', /[\\/](Users|home)[\\/]/i],
  ['a JWT', /eyJ[A-Za-z0-9_-]{10,}/],
  ['an Anthropic key or token', /sk-ant-/],
  ['a Supabase secret key', /sb_secret_/],
  ['a DSN', /postgres(ql)?:\/\//i],
  ['an email address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
];

const mask = (text) => String(text).replace(/\p{L}/gu, 'x').replace(/\p{N}/gu, '9');

function scrubBlock(block, maskAnswer) {
  if (block === null || typeof block !== 'object') return block;
  if (block.type === 'thinking') {
    return {
      ...block,
      thinking: mask(block.thinking ?? ''),
      ...(block.signature === undefined ? {} : { signature: SCRUBBED }),
    };
  }
  if (block.type === 'text' && maskAnswer) return { ...block, text: mask(block.text ?? '') };
  if (block.type === 'tool_result') return { ...block, content: SCRUBBED };
  return block;
}

function scrubDelta(delta, maskAnswer) {
  if (delta === null || typeof delta !== 'object') return delta;
  if (delta.type === 'thinking_delta') return { ...delta, thinking: mask(delta.thinking ?? '') };
  if (delta.type === 'signature_delta') return { ...delta, signature: SCRUBBED };
  if (delta.type === 'text_delta' && maskAnswer) return { ...delta, text: mask(delta.text ?? '') };
  return delta;
}

function scrubMessage(message, maskAnswer) {
  if (message === null || typeof message !== 'object' || !Array.isArray(message.content)) return message;
  return { ...message, content: message.content.map((block) => scrubBlock(block, maskAnswer)) };
}

export function scrubLine(line, maskAnswer) {
  if (line.type === 'system' && line.subtype === 'init') {
    const out = { ...line };
    for (const key of INIT_HOST_KEYS) if (key in out) out[key] = SCRUBBED;
    return out;
  }
  if (line.type === 'user') {
    return {
      ...line,
      message: scrubMessage(line.message, maskAnswer),
      ...(line.tool_use_result === undefined ? {} : { tool_use_result: SCRUBBED }),
    };
  }
  if (line.type === 'assistant') {
    // The CLI's own error text (an API error message) is not an answer and is kept as recorded.
    return { ...line, message: scrubMessage(line.message, maskAnswer && line.is_api_error_message !== true) };
  }
  if (line.type === 'stream_event' && line.event !== null && typeof line.event === 'object') {
    const event = { ...line.event };
    if (event.delta !== undefined) event.delta = scrubDelta(event.delta, maskAnswer);
    if (event.content_block !== undefined) event.content_block = scrubBlock(event.content_block, maskAnswer);
    if (event.message !== undefined) event.message = scrubMessage(event.message, maskAnswer);
    return { ...line, event };
  }
  if (line.type === 'result' && maskAnswer && typeof line.result === 'string' && line.is_error !== true) {
    return { ...line, result: mask(line.result) };
  }
  return line;
}

function main() {
  const [rawPath, fixturePath, ...flags] = process.argv.slice(2);
  if (!rawPath || !fixturePath) {
    console.error('usage: node test/scrub-recording.mjs <raw.jsonl> <fixture.jsonl> [--mask-answer]');
    process.exit(2);
  }
  const maskAnswer = flags.includes('--mask-answer');
  const raw = fs.readFileSync(rawPath, 'utf8').split(/\r?\n/).filter((line) => line.trim() !== '');
  const scrubbed = raw.map((text) => JSON.stringify(scrubLine(JSON.parse(text), maskAnswer)));
  const body = `${scrubbed.join('\n')}\n`;
  const hits = FORBIDDEN.filter(([, pattern]) => pattern.test(body)).map(([label]) => label);
  if (hits.length > 0) {
    console.error(`refused: the scrubbed text still holds ${hits.join(', ')}`);
    process.exit(1);
  }
  fs.writeFileSync(fixturePath, body);
  console.log(`${scrubbed.length} line(s) written, answer text ${maskAnswer ? 'masked' : 'kept'}`);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('test/scrub-recording.mjs')) main();
