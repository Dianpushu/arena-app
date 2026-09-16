// Arena 競技場標誌（UI 內嵌版）。SVG 本體只有一份：assets/icon.svg，
// 這裡用 `?raw` 直接引入原始碼，因此永遠跟圖示檔同步。
// 路徑使用 currentColor，會自動跟著深淺主題變色。

import markSvg from '../../assets/icon.svg?raw';

export default function ArenaMark() {
  return (
    // eslint-disable-next-line react/no-danger
    <span
      className="arena-mark"
      dangerouslySetInnerHTML={{ __html: markSvg as unknown as string }}
    />
  );
}
