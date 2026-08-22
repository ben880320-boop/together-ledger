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

/**
 * 分類與支付方式沿用帳本的完整圖示庫，並保留既有的生活／付款專用圖示。
 * 空字串不屬於此清單：它在資料層專門代表使用者選擇「不使用圖示」。
 */
const CATEGORY_PAYMENT_EXTRA_EMOJI_OPTIONS = [
  "🍜", "⛽", "🧺", "🏷️", "🔁", "💸", "🚌", "🚕", "🚇", "🛫",
] as const;

const uniqueEmojiOptions = (options: readonly string[]) => options.filter((icon, index) => options.indexOf(icon) === index);

export const CATEGORY_EMOJI_OPTIONS = uniqueEmojiOptions([...LEDGER_EMOJI_OPTIONS, ...CATEGORY_PAYMENT_EXTRA_EMOJI_OPTIONS]);
export const PAYMENT_EMOJI_OPTIONS = uniqueEmojiOptions([
  "💵", "💳", "📱", "🏦", "🪙", "💸", "🔁", "🧾", ...LEDGER_EMOJI_OPTIONS,
]);

const LEDGER_ICON_SEARCH_TERMS: Record<string, string> = {
  "❤": "愛心 情侶 戀愛", "💖": "愛心 情侶 喜歡", "🩷": "愛心 粉紅 情侶", "💘": "愛心 戀愛", "💞": "愛心 情侶", "💍": "戒指 結婚 情侶", "🌷": "花 鬱金香", "🌹": "花 玫瑰",
  "🪻": "花 薰衣草", "🏠": "家 家庭 房屋", "🗝️": "家 鑰匙", "👩‍❤️‍👨": "情侶 愛心", "👨‍👩‍👧": "家庭 家人", "🐾": "寵物 動物", "🚗": "車 汽車", "🚆": "火車 交通 旅行", "✈️": "飛機 旅行", "🛵": "機車 交通", "📱": "手機", "💻": "電腦 科技", "💳": "信用卡 卡片", "💵": "金錢 現金", "🪙": "金幣 錢", "🏦": "銀行 存款", "🛍️": "購物", "🛒": "購物 超市", "🧾": "發票 收據", "📑": "文件", "🗓️": "日期 行事曆",
  "📒": "帳本 記帳", "📕": "帳本 書", "📖": "閱讀 書", "📝": "筆記 記帳", "✏️": "鉛筆 筆記", "🎯": "目標", "🧸": "玩具", "🍽️": "餐飲 吃飯", "☕": "咖啡 飲料", "🍳": "料理 吃飯", "🎮": "遊戲", "🎬": "電影", "🎵": "音樂", "🎧": "耳機 音樂", "🎓": "學習", "💼": "工作", "🧰": "工具", "🏥": "醫療 醫院", "💊": "醫療 藥", "🏋️": "運動 健身", "🧘": "瑜伽 運動", "🎂": "生日", "🎁": "禮物", "🏖️": "海邊 旅行", "🌙": "月亮 夜晚", "✨": "星光", "🌟": "星星", "🌈": "彩虹", "🌳": "森林 樹", "🌊": "海洋 海", "🏔️": "山 旅行", "⛺": "露營 旅行", "🐱": "貓 寵物", "🐶": "狗 寵物", "🌼": "花", "🔐": "安全 鎖", "📷": "相機 拍照", "💡": "點子", "🔧": "工具 維修", "📦": "箱子 收納",
};

const CATEGORY_PAYMENT_ICON_SEARCH_TERMS: Record<string, string> = {
  "🍜": "餐飲 吃飯 麵 食物", "⛽": "加油 汽車 車", "🧺": "生活 日用 洗衣", "🏷️": "分類 標籤", "🔁": "轉帳 轉移", "💸": "支出 花費", "🚌": "公車 交通", "🚕": "計程車 交通", "🚇": "捷運 交通", "🛫": "旅行 飛機 出國",
};

/** 以表情或中文情境關鍵字篩選帳本圖示；空字串會回傳全部選項。 */
export function searchLedgerIconOptions(query: string): readonly Exclude<LedgerIcon, null>[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return LEDGER_EMOJI_OPTIONS;
  return LEDGER_EMOJI_OPTIONS.filter(icon => icon.includes(keyword) || LEDGER_ICON_SEARCH_TERMS[icon]?.toLowerCase().includes(keyword));
}

/** 以表情或中文情境詞篩選分類／支付方式圖示；空字串會回傳傳入清單的完整選項。 */
export function searchCategoryPaymentIconOptions(query: string, options: readonly string[]): readonly string[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return options;
  return options.filter(icon => icon.includes(keyword)
    || LEDGER_ICON_SEARCH_TERMS[icon]?.toLowerCase().includes(keyword)
    || CATEGORY_PAYMENT_ICON_SEARCH_TERMS[icon]?.toLowerCase().includes(keyword));
}
