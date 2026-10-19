import type { Result } from '../../shared/api';

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败，请重试。';
