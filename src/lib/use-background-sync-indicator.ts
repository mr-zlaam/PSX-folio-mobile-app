import React from "react";

export function useBackgroundSyncIndicator() {
  const pendingSyncCountRef = React.useRef(0);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = React.useState(false);

  const beginBackgroundSync = React.useCallback(() => {
    pendingSyncCountRef.current += 1;
    if (pendingSyncCountRef.current === 1) {
      setIsBackgroundSyncing(true);
    }
  }, []);

  const endBackgroundSync = React.useCallback(() => {
    pendingSyncCountRef.current = Math.max(0, pendingSyncCountRef.current - 1);
    if (pendingSyncCountRef.current === 0) {
      setIsBackgroundSyncing(false);
    }
  }, []);

  const resetBackgroundSync = React.useCallback(() => {
    pendingSyncCountRef.current = 0;
    setIsBackgroundSyncing(false);
  }, []);

  React.useEffect(() => {
    return () => {
      pendingSyncCountRef.current = 0;
    };
  }, []);

  return {
    isBackgroundSyncing,
    beginBackgroundSync,
    endBackgroundSync,
    resetBackgroundSync,
  };
}
