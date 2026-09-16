import type { UpdateStatus } from '../api';
import type { Notice } from '../App';

export default function Toasts({ update, notice }: { update: UpdateStatus; notice: Notice | null }) {
  return (
    <div className="toasts">
      {update.state === 'downloaded' && (
        <div className="toast ok">🎉 新版本已下載完成，到設定裡重新啟動即可更新。</div>
      )}
      {update.state === 'error' && (
        <div className="toast err">更新檢查失敗：{update.message ?? '未知錯誤'}</div>
      )}
      {notice && <div className="toast info" key={notice.id}>{notice.text}</div>}
    </div>
  );
}
