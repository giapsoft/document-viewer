import { useCallback } from 'react';
import { setPagePanelsTrack } from '../lib/panelSlotRegistry';

export function usePagePanelsTrackRef() {
  return useCallback((el: HTMLDivElement | null) => {
    setPagePanelsTrack(el);
  }, []);
}
