import { dateKey } from '../../../shared/schedules';

export const weekdays = [
  '周日',
  '周一',
  '周二',
  '周三',
  '周四',
  '周五',
  '周六',
];
export const monthLabel = (day: Date) =>
  `${day.getFullYear()}年${day.getMonth() + 1}月`;
export const timeLabel = (value: string | Date) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
export const localDateTime = (date: Date) =>
  `${dateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
export const today = () => dateKey(new Date());
export const dayLabel = (day: Date) =>
  `${day.getMonth() + 1}月${day.getDate()}日`;
