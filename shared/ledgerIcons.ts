/**
 * 帳本圖示的單一資料來源。
 *
 * `null` 代表不顯示帳本圖示；其餘 69 個表情圖示可用於建立及設定帳本。
 * Web／PWA 與 Android 都必須從這個模組讀取，避免兩端選項逐漸失去同步。
 */
export const LEDGER_ICON_OPTIONS = [
  null,
  "❤", "💖", "🩷", "💘", "💞", "💍", "🌷", "🌹", "🪻",
  "🏠", "🗝️", "👩‍❤️‍👨", "👨‍👩‍👧", "🐾", "🚗", "🚆", "✈️", "🛵", "📱",
  "💻", "💳", "💵", "🪙", "🏦", "🛍️", "🛒", "🧾", "📑", "🗓️",
  "📒", "📕", "📖", "📝", "✏️", "🎯", "🧸", "🍽️", "☕", "🍳",
  "🎮", "🎬", "🎵", "🎧", "🎓", "💼", "🧰", "🏥", "💊", "🏋️",
  "🧘", "🎂", "🎁", "🏖️", "🌙", "✨", "🌟", "🌈", "🌳", "🌊",
  "🏔️", "⛺", "🐱", "🐶", "🌼", "🔐", "📷", "💡", "🔧", "📦",
] as const;

export type LedgerIcon = (typeof LEDGER_ICON_OPTIONS)[number];
export const LEDGER_EMOJI_OPTIONS = LEDGER_ICON_OPTIONS.filter((icon): icon is Exclude<LedgerIcon, null> => icon !== null);
