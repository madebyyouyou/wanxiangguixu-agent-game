export function parseAgentResponse(raw) {
  let text = raw || '';
  let state = null;
  let action = null;

  const stateMatch = text.match(/<state>\s*([^<>\s]+)/);
  if (stateMatch) state = stateMatch[1].trim();

  const actionMatch = text.match(/<action>\s*([\s\S]*?)\s*<\/action>/)
    || text.match(/<action>\s*(\{[\s\S]*?\})/)
    || text.match(/(\{[^{}]*?"type"\s*:\s*"(?:purchase|insight)"[\s\S]*?\})/);
  if (actionMatch) {
    const json = actionMatch[1].trim()
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/，/g, ',')
      .replace(/：/g, ':')
      .replace(/```(?:json)?/gi, '');
    try {
      action = JSON.parse(json);
    } catch {
      action = null;
    }
  }

  text = text
    .replace(/<action>[\s\S]*?<\/action>/g, '')
    .replace(/<action>\s*\{[\s\S]*?\}/g, '')
    .replace(/\{[^{}]*?"type"\s*:\s*"(?:purchase|insight)"[\s\S]*?\}/g, '')
    .replace(/<\/?action>/g, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/<state>[^<]*?(?:<\/state>|>|$)/g, '')
    .replace(/<\/?state>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { state, text, action };
}
