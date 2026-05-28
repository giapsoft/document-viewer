import { APP_VERSION, BUILD_ID } from '../lib/appVersion';

export function VersionBadge() {
  return (
    <div className="version-badge" title={`Build ${BUILD_ID} UTC`}>
      v{APP_VERSION} · {BUILD_ID}
    </div>
  );
}
