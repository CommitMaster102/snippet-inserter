/**
 * One text in many scripts, for tests that send text through every path of the extension.
 *
 * Each part is a line of the text and names a way text goes wrong: a script written without
 * spaces, a right-to-left script with digits, an emoji built from several code points, a letter
 * with a separate accent mark, characters that have no width, and full-width punctuation. Both
 * the Node unit tests and the browser tests load this module, so it uses plain CommonJS.
 */
'use strict';

const PARTS = {
  japanese: 'お世話になっております。山田太郎です。',
  chinese: '你好，世界。感谢您的来信。',
  korean: '안녕하세요. 감사합니다.',
  arabic: 'مرحبا ١٢٣ بكم 456',
  hebrew: 'שלום 123 עולם',
  thai: 'สวัสดีครับ ขอบคุณมาก',
  hindi: 'नमस्ते दुनिया',
  family: '👨‍👩‍👧',
  flag: '🇯🇵',
  skinTone: '👍🏽',
  combining: 'café l’école',
  zeroWidth: 'a​b‍c﻿d',
  fullWidth: '（テスト）：「引用」！？',
  tab: 'a\tb',
};

// Lines joined with line feeds, as the text boxes of a page hold them.
const TEXT = Object.values(PARTS).join('\n');
// The same text as a Windows file would hold it.
const TEXT_CRLF = Object.values(PARTS).join('\r\n');

const TITLE = 'お名前 👨‍👩‍👧 café';
// Abbreviations are typed with an input method or a keyboard, with no spaces.
const ABBREVIATION = 'あいさつ';
const LABEL = 'お名前';
const FILL_IN_TEXT = `ご連絡ありがとうございます、{input:${LABEL}}様。`;

/** The number of characters the extension shows for `text`, an emoji counting as one. */
function characterCount(text) {
  return [...text].length;
}

module.exports = {
  PARTS,
  TEXT,
  TEXT_CRLF,
  TITLE,
  ABBREVIATION,
  LABEL,
  FILL_IN_TEXT,
  characterCount,
};
