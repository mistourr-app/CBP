// ============================================================================
// dom.js — мелкие помощники для работы с DOM.
// ============================================================================

/**
 * query с обязательным результатом: если элемента нет, это ошибка
 * разработчика, а не тихое поведение «ничего не работает».
 */
export function el(selector, root = document) {
  const node = root.querySelector(selector);
  if (!node) throw new Error(`Не найден элемент: ${selector}`);
  return node;
}

/** Создание элемента с классами, текстом и атрибутами. */
export function h(tag, { class: className, text, title, attrs, style } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (title) node.title = title;
  if (attrs) for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (style) Object.assign(node.style, style);
  return node;
}

/** Краткое число: 1234 -> «1 234» */
export function formatNumber(value) {
  const rounded = Math.floor(value);
  return rounded.toLocaleString('ru-RU').replace(/ /g, ' ');
}

/** Знак числа с плюсом для положительных значений. */
export function formatDelta(value) {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return '0';
  const sign = rounded > 0 ? '+' : '−';
  return sign + formatNumber(Math.abs(rounded));
}