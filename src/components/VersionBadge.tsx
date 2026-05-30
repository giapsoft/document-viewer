import { APP_VERSION, BUILD_ID } from '../lib/appVersion';

export function VersionBadge({ className }: { className?: string }) {
  return (
    <span
      className={className ? `version-badge ${className}` : 'version-badge'}
      title={`Build ${BUILD_ID} UTC`}
    >
      v{APP_VERSION} · {BUILD_ID}
    </span>
  );
}
