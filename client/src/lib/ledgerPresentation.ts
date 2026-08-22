type LedgerIconItem = { name?: string | null; icon?: string | null };

const CATEGORY_LEGACY_EMOJI: Record<string, string> = {
  food: "🍜", car: "🚗", home: "🏠", shopping: "🛍️", heart: "💕", income: "💰",
  "⌂": "🏠", "◌": "🏷️", "♡": "💕", "↗": "💰", "＋": "💰", "◇": "🛍️", "✦": "✨",
};

const PAYMENT_LEGACY_EMOJI: Record<string, string> = {
  cash: "💵", card: "💳", pay: "📱", bank: "🏦", "現": "💵", "卡": "💳", "支": "📱", "銀": "🏦",
};

export function categoryEmoji(item?: LedgerIconItem) {
  const icon = item?.icon?.trim() || "";
  const legacy = CATEGORY_LEGACY_EMOJI[icon.toLowerCase()];
  if (legacy && icon !== "◌") return legacy;
  const label = `${item?.name || ""} ${icon}`;
  if (/油/.test(label)) return "⛽";
  if (/餐|飲|咖啡|食/.test(label)) return "🍜";
  if (/交|車|停/.test(label)) return "🚗";
  if (/住|房|水|電|生活|日用/.test(label)) return "🏠";
  if (/購|衣|3c|娛樂|遊戲/.test(label)) return "🛍️";
  if (/旅|出遊/.test(label)) return "✈️";
  if (/薪|收入|獎金/.test(label)) return "💰";
  return legacy || icon || "🏷️";
}

export function paymentEmoji(item?: LedgerIconItem) {
  const icon = item?.icon?.trim() || "";
  const legacy = PAYMENT_LEGACY_EMOJI[icon.toLowerCase()];
  if (legacy) return legacy;
  const label = `${item?.name || ""} ${icon}`;
  if (/現金/.test(label)) return "💵";
  if (/信用|卡/.test(label)) return "💳";
  if (/電子|line|街口|pay/.test(label)) return "📱";
  if (/銀行|轉帳/.test(label)) return "🏦";
  return icon || "💳";
}

export function normalizeLedgerWorkspace(workspace: any) {
  if (!workspace) return workspace;
  return {
    ...workspace,
    categories: workspace.categories?.map((item: LedgerIconItem) => ({ ...item, icon: categoryEmoji(item) })),
    paymentMethods: workspace.paymentMethods?.map((item: LedgerIconItem) => ({ ...item, icon: paymentEmoji(item) })),
    analytics: workspace.analytics ? {
      ...workspace.analytics,
      categories: workspace.analytics.categories?.map((item: LedgerIconItem) => ({ ...item, icon: categoryEmoji(item) })),
    } : workspace.analytics,
    previousAnalytics: workspace.previousAnalytics ? {
      ...workspace.previousAnalytics,
      categories: workspace.previousAnalytics.categories?.map((item: LedgerIconItem) => ({ ...item, icon: categoryEmoji(item) })),
    } : workspace.previousAnalytics,
  };
}

export function formatActivityTimestamp(value: unknown) {
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime())
    ? "時間資料暫時無法顯示"
    : date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}
