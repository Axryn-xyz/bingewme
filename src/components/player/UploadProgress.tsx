import { X, Upload, Check } from 'lucide-react';
import { formatBytes, type UploadProgress as Progress } from '../../lib/upload';
export function UploadProgress({
  progress,
  name,
  onCancel,
}: {
  progress: Progress;
  name: string;
  onCancel: () => void;
}) {
  const percent = progress.phase === 'finishing' ? 100 : Math.floor(progress.percent);
  const eta =
    progress.remainingSeconds === null
      ? 'Calculating…'
      : progress.remainingSeconds < 60
        ? `${Math.ceil(progress.remainingSeconds)}s left`
        : `${Math.ceil(progress.remainingSeconds / 60)}m left`;
  return (
    <section className="upload-progress" aria-label={`Uploading ${name}`}>
      <div className="upload-heading">
        <span className="upload-live-icon">
          {progress.phase === 'finishing' ? <Check size={17} /> : <Upload size={17} />}
        </span>
        <div>
          <strong>
            {progress.phase === 'checking'
              ? 'Checking file size…'
              : progress.phase === 'finishing'
                ? 'Upload sent. Finishing up…'
                : 'Uploading for the room'}
          </strong>
          <p title={name}>{name}</p>
        </div>
        <button title="Cancel upload" onClick={onCancel}>
          <X size={17} />
        </button>
      </div>
      <div className="upload-numbers">
        <span>
          <strong className="upload-percent" key={percent}>
            {percent}
            <small>%</small>
          </strong>
        </span>
        <span>
          {formatBytes(progress.loaded)} <span>/ {formatBytes(progress.total)}</span>
        </span>
      </div>
      <div
        className="upload-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}% uploaded`}
      >
        <div className="upload-fill" style={{ transform: `scaleX(${progress.percent / 100})` }} />
        <span className="upload-pulse" />
      </div>
      <div className="upload-stats">
        <span>
          <i />
          {progress.phase === 'uploading'
            ? `${formatBytes(progress.bytesPerSecond)}/s`
            : progress.phase === 'checking'
              ? 'PREPARING UPLOAD'
              : 'WAITING FOR SERVER'}
        </span>
        <span>{progress.phase === 'uploading' ? eta : 'Keep this tab open'}</span>
      </div>
    </section>
  );
}
