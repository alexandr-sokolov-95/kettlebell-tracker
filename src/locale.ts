export const statusNames = { Learned: 'Освоено', Learning: 'Изучаю', 'Not learned': 'Не изучено' };
export const number = new Intl.NumberFormat('ru-RU');
const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' });
const timestampDate = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' });
export function localDate(now = new Date()) {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(part => String(part).padStart(2, '0')).join('-');
}
export function trainingDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
export function formatDate(timestamp: string, selected?: string) {
  return selected && validDate(selected) ? date.format(trainingDate(selected)) : timestampDate.format(new Date(timestamp));
}
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && localDate(trainingDate(value)) === value;
}
