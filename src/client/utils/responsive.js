// CC-Remote v2 UI — responsive utilities
// モバイル判定のインライン化を防ぐための単一ポイント。
// 閾値 768px は Phase 2-4 で使用。変更する場合はこのファイル1箇所で統一する。

export const MOBILE_BREAKPOINT_PX = 768;

export function isMobileWidth() {
  return typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT_PX;
}
