import test from 'node:test';
import assert from 'node:assert/strict';
import { postProcessChineseText, translateTitleDeterministic, localizeProductSync } from '../server/translate.js';
import { CURATED_BY_SOURCE_ID } from '../server/curated-translations.js';

test('code 按上下文翻译，不再一律变成兑换码', () => {
  assert.equal(postProcessChineseText('支持 VS兑换码 与 claude兑换码'), '支持 VS Code 与 Claude Code');
  assert.ok(!postProcessChineseText('Claude Dev 可用').includes('Claude Dev'));
  assert.equal(postProcessChineseText('登录兑换码会发送到邮箱'), '登录验证码会发送到邮箱');
});

test('模型名与专有名词保持原样', () => {
  assert.equal(postProcessChineseText('模型 gpt-6-阿斯特拉'), '模型 gpt-6-astra');
  assert.equal(postProcessChineseText('克劳德与双子座'), 'Claude与Gemini');
});

test('API 术语使用正确译法', () => {
  const out = postProcessChineseText('100M 代币的 API 钥匙，型号：claude');
  assert.ok(out.includes('Token') && out.includes('API 密钥') && out.includes('模型'));
  assert.ok(!/代币|钥匙|型号/.test(out));
});

test('Vibi 1M/3M/7M 表示积分而不是月份', () => {
  const zh = translateTitleDeterministic('Vibi.pro AI Voice Credits – 3M');
  assert.ok(!/个月/.test(zh));
});

test('精校译文优先，且修正上游时长矛盾', () => {
  const [sourceId, curated] = Object.entries(CURATED_BY_SOURCE_ID).find(([, v]) => /3天/.test(v.nameZh) && /Codex/i.test(v.nameZh))!;
  const loc = localizeProductSync({ sourceId, name: 'API CODEX - 100M Token - 3 Days', description: 'Validity: 2 Days' });
  assert.equal(loc.nameZh, curated.nameZh);
  assert.ok(!/有效期[：:]\s*2\s*天/.test(loc.descZh));
});
