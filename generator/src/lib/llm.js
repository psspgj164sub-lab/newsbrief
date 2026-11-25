// (선택 기능) AI 요약. ANTHROPIC_API_KEY 가 없으면 아무것도 하지 않고, 앱은 자동 정리만으로 동작합니다.
// SDK도 키가 있을 때만 불러오므로 설치하지 않아도 됩니다: npm install @anthropic-ai/sdk
import { log } from './util.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
let clientPromise = null;

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

async function getClient() {
  if (!aiEnabled()) return null;
  clientPromise ??= import('@anthropic-ai/sdk')
    .then(({ default: Anthropic }) => new Anthropic())
    .catch((e) => {
      log(`[AI] SDK를 불러오지 못해 AI 요약을 끕니다 (npm install @anthropic-ai/sdk): ${e.message}`);
      return null;
    });
  return clientPromise;
}

export const BASE_RULES = `너는 한국어 뉴스 브리핑 에디터다.
- 주어진 자료에 있는 내용만 쓴다. 자료에 없는 사실, 숫자, 인물 발언을 지어내지 않는다.
- 외국어 자료는 자연스러운 한국어로 옮긴다. 고유명사는 통용되는 한국어 표기를 쓴다.
- 중립적이고 건조한 보도체(~했다, ~이다)로 쓴다. 특정 정당·진영의 표현을 그대로 따르지 않는다.
- 반드시 JSON 객체 하나만 출력한다. 코드블록이나 설명을 붙이지 않는다.`;

function parseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('응답에서 JSON을 찾지 못함');
  return JSON.parse(text.slice(start, end + 1));
}

/** Claude 호출 → JSON. 실패 시 1회 재시도, 그래도 실패하면 null */
export async function askJSON(prompt, { maxTokens = 6000, system = BASE_RULES, tag = '' } = {}) {
  const client = await getClient();
  if (!client) return null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      return parseJson(text);
    } catch (e) {
      log(`[AI] ${tag} 실패 (${attempt}/2): ${e.message}`);
    }
  }
  return null;
}
